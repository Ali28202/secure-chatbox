import { prisma } from '@repo/database';
import {
  canLeaveChat,
  canManageMembers,
  canMuteMember,
  canUpdateChat,
  canUpdateMember,
  isChatCreator,
  type AddMemberInput,
  type ChatDto,
  type ChatListItemDto,
  type ChatMemberDto,
  type CreateChatInput,
  type UpdateChatInput,
  type UpdateMemberInput,
} from '@repo/shared';
import { Errors } from '../../lib/errors';
import {
  chatListSelect,
  chatMemberSelect,
  chatSelect,
  toChatDto,
  toChatListItemDto,
  toChatMemberDto,
  type ChatMemberRow,
  type ChatRow,
} from '../../lib/mappers';
import { countUnread, readWatermarks } from '../../lib/receipts';
import { socketGateway } from '../../socket/gateway';

const CHAT_NOT_FOUND = 'این گفت‌وگو وجود ندارد یا به آن دسترسی ندارید.';
const NOT_CHAT_ADMIN = 'فقط مدیر گفت‌وگو می‌تواند این کار را انجام دهد.';
const DIRECT_IMMUTABLE = 'اعضای گفت‌وگوی خصوصی قابل تغییر نیستند.';
// Distinct from NOT_CHAT_ADMIN on purpose: the person reading this *is* an
// admin of the chat, so being told they are not one would send them looking
// for the wrong thing.
const NOT_ROSTER_MANAGER = 'تغییر اعضا تنها از عهدهٔ استادان و سازندهٔ گفت‌وگو برمی‌آید.';
const CREATOR_PROTECTED = 'سازندهٔ گفت‌وگو را نمی‌توان تغییر داد یا حذف کرد.';

class ChatService {
  async getUserChats(userId: string): Promise<ChatListItemDto[]> {
    const chats = await prisma.chat.findMany({
      where: { members: { some: { userId } } },
      select: chatListSelect,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });

    const chatIds = chats.map((chat) => chat.id);
    const [unread, watermarks] = await Promise.all([
      countUnread(userId, chatIds),
      readWatermarks(chatIds),
    ]);

    return chats.map((chat) =>
      toChatListItemDto(chat, {
        unreadCount: unread.get(chat.id) ?? 0,
        watermarks: watermarks.get(chat.id),
      })
    );
  }

  async getChat(chatId: string, userId: string): Promise<ChatListItemDto> {
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, members: { some: { userId } } },
      select: chatListSelect,
    });

    if (!chat) {
      throw Errors.notFound(CHAT_NOT_FOUND);
    }

    const [unread, watermarks] = await Promise.all([
      countUnread(userId, [chatId]),
      readWatermarks([chatId]),
    ]);

    return toChatListItemDto(chat, {
      unreadCount: unread.get(chatId) ?? 0,
      watermarks: watermarks.get(chatId),
    });
  }

  async createChat(creatorId: string, input: CreateChatInput): Promise<ChatDto> {
    return input.type === 'DIRECT'
      ? this.createDirectChat(creatorId, input.memberId)
      : this.createGroupChat(creatorId, input);
  }

  async addMember(
    chat: ChatRow,
    actor: ChatMemberRow,
    input: AddMemberInput
  ): Promise<ChatMemberDto> {
    if (!canManageMembers(chat, actor)) {
      throw Errors.forbidden(chat.type === 'DIRECT' ? DIRECT_IMMUTABLE : NOT_ROSTER_MANAGER);
    }

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, isActive: true },
    });

    if (!user?.isActive) {
      throw Errors.notFound('این کاربر وجود ندارد.');
    }

    const existing = await prisma.chatMember.findUnique({
      where: { userId_chatId: { userId: input.userId, chatId: chat.id } },
      select: { userId: true },
    });

    if (existing) {
      throw Errors.conflict('این کاربر از قبل عضو گفت‌وگو است.');
    }

    const member = await prisma.chatMember.create({
      data: { chatId: chat.id, userId: input.userId, role: input.role },
      select: chatMemberSelect,
    });

    await socketGateway.joinChat(chat.id, input.userId);

    return toChatMemberDto(member);
  }

  async removeMember(chat: ChatRow, actor: ChatMemberRow, userId: string): Promise<void> {
    const isSelf = actor.user.id === userId;

    if (isSelf) {
      const otherAdmins =
        actor.role === 'ADMIN'
          ? await prisma.chatMember.count({
              where: { chatId: chat.id, role: 'ADMIN', userId: { not: userId } },
            })
          : 0;

      if (!canLeaveChat(chat, actor, otherAdmins)) {
        throw Errors.forbidden(
          chat.type === 'DIRECT'
            ? DIRECT_IMMUTABLE
            : 'پیش از ترک گفت‌وگو باید مدیریت آن را به عضو دیگری بسپارید.'
        );
      }
    } else if (chat.type === 'DIRECT') {
      throw Errors.forbidden(DIRECT_IMMUTABLE);
    } else if (isChatCreator(chat, userId)) {
      // Checked before the roster permission, and in the same order as
      // updateMember, so that both routes give one answer for one situation.
      // Removing the creator is otherwise a way around the demotion guard:
      // drop them from the roster and the chat has no protected admin left.
      throw Errors.forbidden(CREATOR_PROTECTED);
    } else if (!canManageMembers(chat, actor)) {
      throw Errors.forbidden(NOT_ROSTER_MANAGER);
    }

    const deleted = await prisma.chatMember.deleteMany({ where: { chatId: chat.id, userId } });

    if (deleted.count === 0) {
      throw Errors.notFound('این کاربر عضو گفت‌وگو نیست.');
    }

    socketGateway.leaveChat(chat.id, userId);
  }

  async updateChat(chat: ChatRow, actor: ChatMemberRow, input: UpdateChatInput): Promise<ChatDto> {
    if (!canUpdateChat(chat, actor)) {
      throw Errors.forbidden(chat.type === 'DIRECT' ? DIRECT_IMMUTABLE : NOT_CHAT_ADMIN);
    }

    const updated = await prisma.chat.update({
      where: { id: chat.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.isReadOnly !== undefined ? { isReadOnly: input.isReadOnly } : {}),
      },
      select: chatSelect,
    });

    socketGateway.emitToChat(chat.id, 'chat:updated', chat.id);

    return toChatDto(updated);
  }

  async updateMember(
    chat: ChatRow,
    actor: ChatMemberRow,
    userId: string,
    input: UpdateMemberInput
  ): Promise<ChatMemberDto> {
    const target = await prisma.chatMember.findUnique({
      where: { userId_chatId: { userId, chatId: chat.id } },
      select: chatMemberSelect,
    });

    if (!target) {
      throw Errors.notFound('این کاربر عضو گفت‌وگو نیست.');
    }

    if (!canUpdateMember(chat, actor, target)) {
      throw Errors.forbidden(
        chat.type === 'DIRECT'
          ? DIRECT_IMMUTABLE
          : actor.user.id === userId
            ? 'نمی‌توانید عضویت خودتان را تغییر دهید.'
            : isChatCreator(chat, userId)
              ? CREATOR_PROTECTED
              : NOT_ROSTER_MANAGER
      );
    }

    if (input.isMuted === true && !canMuteMember(chat, actor, target)) {
      throw Errors.forbidden('مدیر گفت‌وگو را نمی‌توان بی‌صدا کرد.');
    }

    const updated = await prisma.chatMember.update({
      where: { userId_chatId: { userId, chatId: chat.id } },
      data: {
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.isMuted !== undefined ? { isMuted: input.isMuted } : {}),
      },
      select: chatMemberSelect,
    });

    socketGateway.emitToChat(chat.id, 'chat:updated', chat.id);

    const watermarks = await readWatermarks([chat.id]);

    return toChatMemberDto(updated, watermarks.get(chat.id)?.get(userId) ?? null);
  }

  async findMembership(
    chatId: string,
    userId: string
  ): Promise<{ member: ChatMemberRow; chat: ChatRow } | null> {
    const row = await prisma.chatMember.findUnique({
      where: { userId_chatId: { userId, chatId } },
      select: { ...chatMemberSelect, chat: { select: chatSelect } },
    });

    if (!row) return null;

    const { chat, ...member } = row;
    return { member, chat };
  }

  private async createDirectChat(creatorId: string, otherUserId: string): Promise<ChatDto> {
    if (creatorId === otherUserId) {
      throw Errors.validation(
        [{ path: 'memberId', message: 'نمی‌توانید با خودتان گفت‌وگو کنید.' }],
        'نمی‌توانید با خودتان گفت‌وگو کنید.'
      );
    }

    const other = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, isActive: true },
    });

    if (!other?.isActive) {
      throw Errors.notFound('این کاربر وجود ندارد.');
    }

    const pair = [creatorId, otherUserId];

    const { chat, isNew } = await prisma.$transaction(async (tx) => {
      const existing = await tx.chat.findFirst({
        where: {
          type: 'DIRECT',
          members: { every: { userId: { in: pair } } },
          AND: pair.map((userId) => ({ members: { some: { userId } } })),
        },
        select: chatSelect,
      });

      if (existing) {
        return { chat: existing, isNew: false };
      }

      const created = await tx.chat.create({
        data: {
          type: 'DIRECT',
          creatorId,
          members: { create: pair.map((userId) => ({ userId, role: 'ADMIN' as const })) },
        },
        select: chatSelect,
      });

      return { chat: created, isNew: true };
    });

    if (isNew) await this.openRooms(chat.id, pair);

    return toChatDto(chat);
  }

  private async createGroupChat(
    creatorId: string,
    input: Extract<CreateChatInput, { type: 'COURSE_GROUP' | 'CUSTOM_GROUP' }>
  ): Promise<ChatDto> {
    const memberIds = [...new Set(input.memberIds)].filter((id) => id !== creatorId);

    if (memberIds.length > 0) {
      const found = await prisma.user.count({
        where: { id: { in: memberIds }, isActive: true },
      });

      if (found !== memberIds.length) {
        throw Errors.validation(
          [{ path: 'memberIds', message: 'یکی از کاربران انتخاب‌شده وجود ندارد.' }],
          'یکی از کاربران انتخاب‌شده وجود ندارد.'
        );
      }
    }

    const chat = await prisma.chat.create({
      data: {
        type: input.type,
        title: input.title,
        creatorId,
        members: {
          create: [
            { userId: creatorId, role: 'ADMIN' as const },
            ...memberIds.map((userId) => ({ userId, role: 'MEMBER' as const })),
          ],
        },
      },
      select: chatSelect,
    });

    await this.openRooms(chat.id, [creatorId, ...memberIds]);

    return toChatDto(chat);
  }

  private async openRooms(chatId: string, userIds: string[]): Promise<void> {
    await Promise.all(userIds.map((userId) => socketGateway.joinChat(chatId, userId)));
  }
}

export const chatService = new ChatService();
