import { prisma, type Prisma } from '@repo/database';
import {
  canDeleteMessage,
  canPinMessage,
  sendBlock,
  SEND_BLOCK_MESSAGES,
  type ListMessagesQuery,
  type MarkReadInput,
  type MarkReadResultDto,
  type MessageDto,
  type MessagePageDto,
  type SendMessageInput,
  type UploadMessageInput,
} from '@repo/shared';
import { Errors } from '../../lib/errors';
import { messageSelect, toMessageDto, type ChatMemberRow, type ChatRow } from '../../lib/mappers';
import { advanceReceipts, countUnread, createDeliveredReceipts } from '../../lib/receipts';
import { removeStored, storeUploads } from '../../lib/storage';
import { socketGateway } from '../../socket/gateway';

const MESSAGE_NOT_FOUND = 'این پیام وجود ندارد.';

/** Ceiling on the pinned list, which has no pagination of its own. */
const PINNED_LIMIT = 50;

/**
 * Messages, as the class diagram describes them: `sendMessage`,
 * `replyToMessage`, `softDeleteMessage`, `getMessages`.
 *
 * Every method here takes the caller's `ChatMemberRow` rather than a user id.
 * That row is proof of membership, produced once by `requireChatMember`, and
 * taking it as an argument is what makes it impossible to write a method here
 * that forgets to check whether the caller belongs in the chat at all.
 */
class MessageService {
  /**
   * A page of history, newest first.
   *
   * Cursor-based, not offset-based: a chat gains rows while it is being read,
   * and `skip`/`take` would then hand the reader a message twice or skip one
   * entirely on every page turn. The keyset below is anchored to a specific row
   * instead, so inserts above it change nothing.
   */
  async getMessages(chatId: string, { before, limit }: ListMessagesQuery): Promise<MessagePageDto> {
    const rows = await prisma.message.findMany({
      where: { chatId, ...(await this.cursorFilter(chatId, before)) },
      select: messageSelect,
      // `createdAt` alone is not a total order — two messages can share a
      // millisecond — and a cursor over a non-unique ordering silently drops or
      // repeats rows. The id breaks ties, and being a UUIDv7 it breaks them in
      // the same direction time runs.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // One extra row is the cheapest possible "is there more?" — the
      // alternative is a second count query against the same index.
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      messages: page.map(toMessageDto),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  /**
   * Posts a message, and — when `replyToId` is set — makes it a reply. The two
   * are one operation because a reply differs from a message only by that
   * column; splitting them would duplicate every permission check below.
   *
   * `files` arrive already parsed but not yet on disk, which is the ordering
   * that matters: a muted member's 10 MB upload is refused before a byte of it
   * is written.
   */
  async sendMessage(
    chat: ChatRow,
    member: ChatMemberRow,
    input: SendMessageInput | UploadMessageInput,
    files: File[] = []
  ): Promise<MessageDto> {
    this.assertCanSend(chat, member);

    // A caption is optional when something is attached, and the only thing that
    // is never allowed is a message that says nothing at all. Both routes above
    // already make this unreachable; it is asserted here because this method,
    // not either of them, is what owns the invariant.
    const content = input.content?.trim() || null;
    if (content === null && files.length === 0) {
      throw Errors.validation(
        [{ path: 'content', message: 'پیام نمی‌تواند خالی باشد.' }],
        'پیام نمی‌تواند خالی باشد.'
      );
    }

    if (input.replyToId) {
      // Scoped to this chat, so a reply cannot point at a message in a
      // conversation the sender may not even be able to see. Without the
      // `chatId` here, `replyTo` would leak a sender's name and text across
      // chats the moment the reply was rendered.
      const target = await prisma.message.findFirst({
        where: { id: input.replyToId, chatId: chat.id },
        select: { id: true },
      });

      if (!target) {
        throw Errors.validation(
          [{ path: 'replyToId', message: 'پیامی که به آن پاسخ می‌دهید در این گفت‌وگو نیست.' }],
          'پیامی که به آن پاسخ می‌دهید در این گفت‌وگو نیست.'
        );
      }
    }

    // Written to disk before the transaction opens, because writing a file is
    // slow and a transaction held open across it would hold its locks for the
    // duration of an upload. The consequence is that a failed commit leaves
    // files behind, which is what the `catch` below is for.
    const stored = files.length > 0 ? await storeUploads(files) : [];

    // Both writes or neither: a message that exists without bumping
    // `lastMessageAt` sinks to the bottom of everyone's chat list, and a bump
    // without a message points the list at a row that was never written.
    let message;
    try {
      message = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            chatId: chat.id,
            senderId: member.user.id,
            content,
            replyToId: input.replyToId ?? null,
            // Nested, so the rows land inside the same transaction. An
            // attachment written afterwards could be orphaned by a rollback
            // between the two, and nothing would ever look for it.
            ...(stored.length > 0 ? { attachments: { create: stored } } : {}),
          },
          select: messageSelect,
        });

        await tx.chat.update({
          where: { id: chat.id },
          data: { lastMessageAt: created.createdAt },
        });

        // In the same transaction, for the same reason as the bump above: a
        // message that commits without its receipts is a message no unread count
        // will ever include, and nothing later reconciles the two.
        await createDeliveredReceipts(tx, {
          chatId: chat.id,
          messageId: created.id,
          senderId: member.user.id,
        });

        return created;
      });
    } catch (error) {
      // The rows never committed, so nothing will ever reference these files
      // again. Cleaning up here is the only chance anything gets.
      await removeStored(stored.map((file) => file.fileUrl));
      throw error;
    }

    const dto = toMessageDto(message);

    // Emitted here, outside the transaction, and never inside it. An emit from
    // within would go out before the commit — and if the commit then failed,
    // every open client would be showing a message the database never accepted,
    // with nothing to correct it short of a reload.
    socketGateway.emitToChat(chat.id, 'message:new', dto);

    return dto;
  }

  /**
   * Soft-deletes a message: the row stays, its text goes.
   *
   * A hard delete would take the replies with it (`replyTo` is `SetNull`, so
   * they would survive as answers to nothing) and would let someone erase their
   * half of a conversation the other person was relying on. Clearing the
   * content keeps the thread readable and the record honest.
   */
  async softDeleteMessage(
    chat: ChatRow,
    member: ChatMemberRow,
    messageId: string
  ): Promise<MessageDto> {
    const message = await prisma.message.findFirst({
      where: { id: messageId, chatId: chat.id },
      select: {
        id: true,
        senderId: true,
        isDeleted: true,
        // Read here rather than after the update, because the update deletes
        // the rows — this is the last moment anything knows which files on disk
        // belonged to this message.
        attachments: { select: { fileUrl: true } },
      },
    });

    if (!message) {
      throw Errors.notFound(MESSAGE_NOT_FOUND);
    }

    // Your own message is always yours to withdraw. Anyone else's is a
    // moderation action, which in a course group is the professor's — they hold
    // `ChatRole.ADMIN`.
    if (!canDeleteMessage(member, message.senderId)) {
      throw Errors.forbidden('تنها فرستندهٔ پیام یا مدیر گفت‌وگو می‌تواند آن را حذف کند.');
    }

    if (message.isDeleted) {
      // Already a tombstone. Returning it rather than erroring keeps a
      // double-click, or a retry after a dropped response, from turning into a
      // failure the user has to think about.
      //
      // No emit: nothing changed, and the clients were told the first time.
      return this.requireMessage(chat.id, messageId);
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      // `content` is nulled in the database, not just hidden by the mapper.
      // Hiding it would leave the text one forgotten `select` away from being
      // served again.
      //
      // Unpinned in the same write: a pin is a pointer to something worth
      // re-reading, and a tombstone is not that. Leaving the flag set would put
      // «این پیام حذف شده است» at the top of the chat until someone noticed.
      data: { isDeleted: true, content: null, isPinned: false, attachments: { deleteMany: {} } },
      select: messageSelect,
    });

    // After the row is gone, and only then. Deleting the file first would leave
    // a broken download link behind if the update failed; deleting it after
    // means the worst case is an orphaned blob, which nothing can reach because
    // the row that named it no longer exists.
    await removeStored(message.attachments.map((attachment) => attachment.fileUrl));

    const dto = toMessageDto(updated);

    // The tombstone travels, not just the id: a client holding this message in
    // a reply quote has to redraw that quote too, and it needs the whole row to
    // know which one.
    socketGateway.emitToChat(chat.id, 'message:deleted', dto);

    return dto;
  }

  /**
   * Marks everything up to `upToMessageId` read for this member.
   *
   * Batched by design — the client reports the newest message it has actually
   * had on screen once its scrolling settles, not one call per message. Thirty
   * messages read in one flick of the wrist is one round trip.
   *
   * Notably not gated on `assertCanSend`: someone who has been muted, or who is
   * in a read-only announcement chat, is exactly the person who reads without
   * writing. Membership is the only requirement, and the guard above this route
   * has already established it.
   */
  async markAsRead(
    chat: ChatRow,
    member: ChatMemberRow,
    input: MarkReadInput
  ): Promise<MarkReadResultDto> {
    // Scoped to the chat: an id from another conversation must not be usable to
    // learn a timestamp from it, nor to advance receipts across a boundary.
    const anchor = await prisma.message.findFirst({
      where: { id: input.upToMessageId, chatId: chat.id },
      select: { id: true, createdAt: true },
    });

    if (!anchor) {
      throw Errors.notFound(MESSAGE_NOT_FOUND);
    }

    const userId = member.user.id;
    const advanced = await advanceReceipts(userId, chat.id, anchor);

    // Recomputed, not assumed to be zero. The client marks up to what it has
    // *seen*, and a message that arrived below the fold mid-scroll is still
    // unread — answering 0 here would clear a badge that should still be lit.
    const unreadCount = (await countUnread(userId, [chat.id])).get(chat.id) ?? 0;
    const readAt = anchor.createdAt.toISOString();

    // Only when something moved. A conversation the reader is sitting at the
    // bottom of settles over the same last message again and again, and each
    // one would otherwise put a frame on every socket in the chat.
    if (advanced > 0) {
      socketGateway.emitToChat(chat.id, 'receipt:read', { chatId: chat.id, userId, readAt });
    }

    return { chatId: chat.id, upToMessageId: anchor.id, readAt, unreadCount };
  }

  /**
   * Pins or unpins a message. Admin-only, and one endpoint for both directions
   * — the caller states the state it wants rather than toggling.
   *
   * Idempotent on purpose: asking for a state the message is already in is a
   * success with no write and no emit, so two admins pinning at the same moment
   * end up with it pinned rather than with one of them undoing the other.
   */
  async setPinned(
    chat: ChatRow,
    member: ChatMemberRow,
    messageId: string,
    isPinned: boolean
  ): Promise<MessageDto> {
    if (!canPinMessage(member)) {
      throw Errors.forbidden('فقط مدیر گفت‌وگو می‌تواند پیام‌ها را سنجاق کند.');
    }

    const message = await prisma.message.findFirst({
      where: { id: messageId, chatId: chat.id },
      select: { id: true, isDeleted: true, isPinned: true },
    });

    if (!message) {
      throw Errors.notFound(MESSAGE_NOT_FOUND);
    }

    // A tombstone has no content worth returning to. Refused rather than
    // quietly ignored: a client offering the action at all is holding a row
    // that no longer matches the server's, and it should find that out.
    if (message.isDeleted) {
      throw Errors.validation(
        [{ path: 'isPinned', message: 'پیام حذف‌شده را نمی‌توان سنجاق کرد.' }],
        'پیام حذف‌شده را نمی‌توان سنجاق کرد.'
      );
    }

    if (message.isPinned === isPinned) {
      return this.requireMessage(chat.id, messageId);
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isPinned },
      select: messageSelect,
    });

    const dto = toMessageDto(updated);

    socketGateway.emitToChat(chat.id, 'message:updated', dto);

    return dto;
  }

  /**
   * The pinned messages of a chat, newest first.
   *
   * Its own query rather than a filter over the loaded page: the point of a pin
   * is to stay reachable after the conversation has scrolled well past it, so
   * the banner has to be able to show a message the client has never fetched.
   *
   * Capped, because it renders as a list with no pagination of its own. The
   * ceiling is high enough that reaching it means the chat is using pins for
   * something other than pinning.
   */
  async getPinnedMessages(chatId: string): Promise<MessageDto[]> {
    const rows = await prisma.message.findMany({
      where: { chatId, isPinned: true, isDeleted: false },
      select: messageSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PINNED_LIMIT,
    });

    return rows.map(toMessageDto);
  }

  // -------------------------------------------------------------------------

  /**
   * Turns a cursor id into a keyset predicate.
   *
   * Resolved to the anchor row's `createdAt` rather than compared as an id:
   * UUIDv7 sorts by time as a rule of thumb, but the ordering the page is
   * anchored to must be the one the query actually uses, not one that usually
   * agrees with it.
   */
  private async cursorFilter(
    chatId: string,
    before: string | undefined
  ): Promise<Prisma.MessageWhereInput> {
    if (!before) return {};

    const anchor = await prisma.message.findFirst({
      where: { id: before, chatId },
      select: { id: true, createdAt: true },
    });

    if (!anchor) {
      throw Errors.validation(
        [{ path: 'before', message: 'نشانگر صفحه‌بندی معتبر نیست.' }],
        'نشانگر صفحه‌بندی معتبر نیست.'
      );
    }

    return {
      OR: [
        { createdAt: { lt: anchor.createdAt } },
        { createdAt: anchor.createdAt, id: { lt: anchor.id } },
      ],
    };
  }

  private async requireMessage(chatId: string, messageId: string): Promise<MessageDto> {
    const message = await prisma.message.findFirst({
      where: { id: messageId, chatId },
      select: messageSelect,
    });

    if (!message) {
      throw Errors.notFound(MESSAGE_NOT_FOUND);
    }

    return toMessageDto(message);
  }

  /**
   * The two ways a member of a chat can still be unable to write in it.
   *
   * The rule itself lives in `policy.ts`, which the composer also reads to
   * decide whether to disable itself — so the reason the box is greyed out and
   * the reason the request is refused are the same value, and the message shown
   * next to the box is the one the server would have sent back.
   */
  private assertCanSend(chat: ChatRow, member: ChatMemberRow): void {
    const blocked = sendBlock(chat, member);

    if (blocked) {
      throw Errors.forbidden(SEND_BLOCK_MESSAGES[blocked]);
    }
  }
}

export const messageService = new MessageService();
