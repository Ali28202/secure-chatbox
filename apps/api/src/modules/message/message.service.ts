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
  type MessageSearchHitDto,
  type SearchMessagesQuery,
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

const PINNED_LIMIT = 50;

class MessageService {
  async getMessages(chatId: string, { before, limit }: ListMessagesQuery): Promise<MessagePageDto> {
    const rows = await prisma.message.findMany({
      where: { chatId, ...(await this.cursorFilter(chatId, before)) },
      select: messageSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
      messages: page.map(toMessageDto),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async sendMessage(
    chat: ChatRow,
    member: ChatMemberRow,
    input: SendMessageInput | UploadMessageInput,
    files: File[] = []
  ): Promise<MessageDto> {
    this.assertCanSend(chat, member);

    const content = input.content?.trim() || null;
    if (content === null && files.length === 0) {
      throw Errors.validation(
        [{ path: 'content', message: 'پیام نمی‌تواند خالی باشد.' }],
        'پیام نمی‌تواند خالی باشد.'
      );
    }

    if (input.replyToId) {
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

    const stored = files.length > 0 ? await storeUploads(files) : [];

    let message;
    try {
      message = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            chatId: chat.id,
            senderId: member.user.id,
            content,
            replyToId: input.replyToId ?? null,
            ...(stored.length > 0 ? { attachments: { create: stored } } : {}),
          },
          select: messageSelect,
        });

        await tx.chat.update({
          where: { id: chat.id },
          data: { lastMessageAt: created.createdAt },
        });

        await createDeliveredReceipts(tx, {
          chatId: chat.id,
          messageId: created.id,
          senderId: member.user.id,
        });

        return created;
      });
    } catch (error) {
      await removeStored(stored.map((file) => file.s3ObjectKey));
      throw error;
    }

    const dto = toMessageDto(message);

    socketGateway.emitToChat(chat.id, 'message:new', dto);

    return dto;
  }

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
        attachments: { select: { s3ObjectKey: true } },
      },
    });

    if (!message) {
      throw Errors.notFound(MESSAGE_NOT_FOUND);
    }

    if (!canDeleteMessage(member, message.senderId)) {
      throw Errors.forbidden('تنها فرستندهٔ پیام یا مدیر گفت‌وگو می‌تواند آن را حذف کند.');
    }

    if (message.isDeleted) {
      return this.requireMessage(chat.id, messageId);
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, content: null, isPinned: false, attachments: { deleteMany: {} } },
      select: messageSelect,
    });

    await removeStored(message.attachments.map((attachment) => attachment.s3ObjectKey));

    const dto = toMessageDto(updated);

    socketGateway.emitToChat(chat.id, 'message:deleted', dto);

    return dto;
  }

  async markAsRead(
    chat: ChatRow,
    member: ChatMemberRow,
    input: MarkReadInput
  ): Promise<MarkReadResultDto> {
    const anchor = await prisma.message.findFirst({
      where: { id: input.upToMessageId, chatId: chat.id },
      select: { id: true, createdAt: true },
    });

    if (!anchor) {
      throw Errors.notFound(MESSAGE_NOT_FOUND);
    }

    const userId = member.user.id;
    const advanced = await advanceReceipts(userId, chat.id, anchor);

    const unreadCount = (await countUnread(userId, [chat.id])).get(chat.id) ?? 0;
    const readAt = anchor.createdAt.toISOString();

    if (advanced > 0) {
      socketGateway.emitToChat(chat.id, 'receipt:read', { chatId: chat.id, userId, readAt });
    }

    return { chatId: chat.id, upToMessageId: anchor.id, readAt, unreadCount };
  }

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
   * Adds the reaction, or takes it back if it is already there.
   *
   * Anyone who can read the chat may react — there is no `canReact`. Reacting
   * is not moderation and does not change what anyone else sees beyond a tally,
   * so gating it on ADMIN would be ceremony. Being able to *read* the message
   * is the whole permission, and `requireChatMember` has already settled that.
   */
  async toggleReaction(
    chat: ChatRow,
    member: ChatMemberRow,
    messageId: string,
    emoji: string
  ): Promise<MessageDto> {
    const message = await prisma.message.findFirst({
      where: { id: messageId, chatId: chat.id },
      select: { id: true, isDeleted: true },
    });

    if (!message) {
      throw Errors.notFound(MESSAGE_NOT_FOUND);
    }

    if (message.isDeleted) {
      throw Errors.validation(
        [{ path: 'emoji', message: 'به پیام حذف‌شده نمی‌توان واکنش داد.' }],
        'به پیام حذف‌شده نمی‌توان واکنش داد.'
      );
    }

    // The emoji is part of the primary key, so the toggle is one delete or one
    // create — never a read followed by a write that a second tab could race.
    const removed = await prisma.messageReaction.deleteMany({
      where: { messageId, userId: member.user.id, emoji },
    });

    if (removed.count === 0) {
      await prisma.messageReaction.create({
        data: { messageId, userId: member.user.id, emoji },
      });
    }

    const dto = await this.requireMessage(chat.id, messageId);

    socketGateway.emitToChat(chat.id, 'message:updated', dto);

    return dto;
  }

  /**
   * Searches every conversation the caller is in, and nothing else.
   *
   * The membership filter is the whole security of this endpoint: it is the one
   * place in the app where a query fans out across chats, so `members: { some:
   * { userId } }` is what stops it becoming a way to read the whole database by
   * guessing words. Tombstones are excluded — their content is already gone.
   *
   * `contains` compiles to `ILIKE '%…%'`, which the trigram GIN index on
   * `messages.content` turns into a bitmap index scan.
   */
  async searchMessages(userId: string, query: SearchMessagesQuery): Promise<MessageSearchHitDto[]> {
    const rows = await prisma.message.findMany({
      where: {
        isDeleted: false,
        content: { contains: query.q, mode: 'insensitive' },
        chat: { members: { some: { userId } } },
      },
      select: { ...messageSelect, chat: { select: { id: true, title: true, type: true } } },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    return rows.map(({ chat, ...message }) => ({
      message: toMessageDto(message),
      chatId: chat.id,
      chatTitle: chat.title,
      chatType: chat.type,
    }));
  }

  async getPinnedMessages(chatId: string): Promise<MessageDto[]> {
    const rows = await prisma.message.findMany({
      where: { chatId, isPinned: true, isDeleted: false },
      select: messageSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PINNED_LIMIT,
    });

    return rows.map(toMessageDto);
  }

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

  private assertCanSend(chat: ChatRow, member: ChatMemberRow): void {
    const blocked = sendBlock(chat, member);

    if (blocked) {
      throw Errors.forbidden(SEND_BLOCK_MESSAGES[blocked]);
    }
  }
}

export const messageService = new MessageService();
