import { prisma, type Prisma } from '@repo/database';
import type { ListMessagesQuery, MessageDto, MessagePageDto, SendMessageInput } from '@repo/shared';
import { Errors } from '../../lib/errors';
import { messageSelect, toMessageDto, type ChatMemberRow, type ChatRow } from '../../lib/mappers';

const MESSAGE_NOT_FOUND = 'این پیام وجود ندارد.';

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
   */
  async sendMessage(
    chat: ChatRow,
    member: ChatMemberRow,
    input: SendMessageInput
  ): Promise<MessageDto> {
    this.assertCanSend(chat, member);

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

    // Both writes or neither: a message that exists without bumping
    // `lastMessageAt` sinks to the bottom of everyone's chat list, and a bump
    // without a message points the list at a row that was never written.
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          chatId: chat.id,
          senderId: member.user.id,
          content: input.content,
          replyToId: input.replyToId ?? null,
        },
        select: messageSelect,
      });

      await tx.chat.update({
        where: { id: chat.id },
        data: { lastMessageAt: created.createdAt },
      });

      return created;
    });

    return toMessageDto(message);
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
      select: { id: true, senderId: true, isDeleted: true },
    });

    if (!message) {
      throw Errors.notFound(MESSAGE_NOT_FOUND);
    }

    // Your own message is always yours to withdraw. Anyone else's is a
    // moderation action, which in a course group is the professor's — they hold
    // `ChatRole.ADMIN`. M11 moves this predicate into `policy.ts`; it is
    // written out here so the endpoint does not ship without it.
    const isOwn = message.senderId === member.user.id;
    if (!isOwn && member.role !== 'ADMIN') {
      throw Errors.forbidden('تنها فرستندهٔ پیام یا مدیر گفت‌وگو می‌تواند آن را حذف کند.');
    }

    if (message.isDeleted) {
      // Already a tombstone. Returning it rather than erroring keeps a
      // double-click, or a retry after a dropped response, from turning into a
      // failure the user has to think about.
      return this.requireMessage(chat.id, messageId);
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      // `content` is nulled in the database, not just hidden by the mapper.
      // Hiding it would leave the text one forgotten `select` away from being
      // served again.
      data: { isDeleted: true, content: null, attachments: { deleteMany: {} } },
      select: messageSelect,
    });

    return toMessageDto(updated);
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
   * The two ways a member of a chat can still be unable to write in it. Both
   * move into M11's `policy.ts`; both are enforced now, because an endpoint
   * that ignores `isReadOnly` makes the column a decoration.
   */
  private assertCanSend(chat: ChatRow, member: ChatMemberRow): void {
    if (member.isMuted) {
      throw Errors.forbidden('شما در این گفت‌وگو بی‌صدا شده‌اید و نمی‌توانید پیام بفرستید.');
    }

    if (chat.isReadOnly && member.role !== 'ADMIN') {
      throw Errors.forbidden('این گفت‌وگو فقط‌خواندنی است.');
    }
  }
}

export const messageService = new MessageService();
