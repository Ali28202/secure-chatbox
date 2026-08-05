import { prisma } from '@repo/database';
import type {
  AddMemberInput,
  ChatDto,
  ChatListItemDto,
  ChatMemberDto,
  CreateChatInput,
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

const CHAT_NOT_FOUND = 'این گفت‌وگو وجود ندارد یا به آن دسترسی ندارید.';
const NOT_CHAT_ADMIN = 'فقط مدیر گفت‌وگو می‌تواند این کار را انجام دهد.';
const DIRECT_IMMUTABLE = 'اعضای گفت‌وگوی خصوصی قابل تغییر نیستند.';

/**
 * Chats and membership, as the class diagram describes them: `createChat`,
 * `addMember`, `removeMember`, `getUserChats`.
 *
 * Membership is the access boundary for everything downstream — messages,
 * receipts, attachments — so the lookups that establish it live here and every
 * one of them is scoped by the requesting user. There is deliberately no
 * `getChat(id)` that answers without knowing who is asking.
 */
class ChatService {
  /**
   * The sidebar, ordered by the denormalized `lastMessageAt` (ERD delta #2 —
   * the alternative is a correlated `max(createdAt)` per chat on every load).
   *
   * `nulls: 'last'` matters: Postgres sorts NULLs first on a DESC ordering, so
   * without it every chat nobody has written in yet would sit above the
   * conversations people are actually having.
   */
  async getUserChats(userId: string): Promise<ChatListItemDto[]> {
    const chats = await prisma.chat.findMany({
      where: { members: { some: { userId } } },
      select: chatListSelect,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });

    // `unreadCount` stays 0 until M9 puts read receipts behind it — there are
    // no receipt rows to count yet, so any other number would be invented.
    return chats.map((chat) => toChatListItemDto(chat));
  }

  /** One chat, in the same shape as the list, provided the user is a member. */
  async getChat(chatId: string, userId: string): Promise<ChatListItemDto> {
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, members: { some: { userId } } },
      select: chatListSelect,
    });

    if (!chat) {
      throw Errors.notFound(CHAT_NOT_FOUND);
    }

    return toChatListItemDto(chat);
  }

  async createChat(creatorId: string, input: CreateChatInput): Promise<ChatDto> {
    return input.type === 'DIRECT'
      ? this.createDirectChat(creatorId, input.memberId)
      : this.createGroupChat(creatorId, input);
  }

  /**
   * Adds someone to a group. Direct chats are excluded by definition: a
   * two-person conversation that grows a third participant is a different
   * thing, and the pair-uniqueness below depends on it never happening.
   */
  async addMember(
    chatId: string,
    actor: ChatMemberRow,
    input: AddMemberInput
  ): Promise<ChatMemberDto> {
    const chat = await this.requireChat(chatId);

    if (chat.type === 'DIRECT') {
      throw Errors.forbidden(DIRECT_IMMUTABLE);
    }

    this.assertChatAdmin(actor);

    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, isActive: true },
    });

    if (!user?.isActive) {
      throw Errors.notFound('این کاربر وجود ندارد.');
    }

    const existing = await prisma.chatMember.findUnique({
      where: { userId_chatId: { userId: input.userId, chatId } },
      select: { userId: true },
    });

    if (existing) {
      throw Errors.conflict('این کاربر از قبل عضو گفت‌وگو است.');
    }

    const member = await prisma.chatMember.create({
      data: { chatId, userId: input.userId, role: input.role },
      select: chatMemberSelect,
    });

    return toChatMemberDto(member);
  }

  /**
   * Removes a member, or lets one leave.
   *
   * Leaving is the case that keeps this from being an admin-only operation:
   * nobody should need permission to walk out of a conversation. Removing
   * *someone else* is an admin action.
   */
  async removeMember(chatId: string, actor: ChatMemberRow, userId: string): Promise<void> {
    const chat = await this.requireChat(chatId);

    if (chat.type === 'DIRECT') {
      throw Errors.forbidden(DIRECT_IMMUTABLE);
    }

    const isSelf = actor.user.id === userId;
    if (!isSelf) {
      this.assertChatAdmin(actor);
    }

    // The creator leaving would orphan the group — `Chat.creatorId` is
    // `onDelete: Restrict`, and a group with no admin can never be repaired
    // from inside the app. M11 will add ownership transfer; until then the
    // honest answer is to refuse.
    if (isSelf && actor.role === 'ADMIN' && chat.creatorId === userId) {
      throw Errors.forbidden('سازندهٔ گفت‌وگو نمی‌تواند آن را ترک کند.');
    }

    const deleted = await prisma.chatMember.deleteMany({ where: { chatId, userId } });

    if (deleted.count === 0) {
      throw Errors.notFound('این کاربر عضو گفت‌وگو نیست.');
    }
  }

  /**
   * Resolves a user's membership in a chat, or nothing.
   *
   * Returning `null` rather than throwing is what lets `requireChatMember`
   * answer 404 for a chat that exists but is none of your business — see the
   * middleware for why that distinction is worth the extra branch.
   */
  async findMembership(chatId: string, userId: string): Promise<ChatMemberRow | null> {
    return prisma.chatMember.findUnique({
      where: { userId_chatId: { userId, chatId } },
      select: chatMemberSelect,
    });
  }

  // -------------------------------------------------------------------------

  /**
   * Direct chats are unique per pair, so asking twice returns the same chat
   * rather than a second empty thread beside the first.
   *
   * The pair is matched with `every` *and* both `some` clauses: `every` alone is
   * vacuously true for a chat with no members, and `some` alone would match a
   * larger chat that happens to contain both people.
   *
   * Two simultaneous requests for the same new pair can still both miss the
   * lookup and create. Closing that needs a uniqueness constraint on the pair,
   * which is a schema column the submitted ERD does not have — so the check
   * runs inside a transaction, the client disables its button while the request
   * is in flight, and the residual race costs one duplicate thread rather than
   * anything unrecoverable.
   */
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

    return prisma.$transaction(async (tx) => {
      const existing = await tx.chat.findFirst({
        where: {
          type: 'DIRECT',
          members: { every: { userId: { in: pair } } },
          AND: pair.map((userId) => ({ members: { some: { userId } } })),
        },
        select: chatSelect,
      });

      if (existing) {
        return toChatDto(existing);
      }

      const chat = await tx.chat.create({
        data: {
          type: 'DIRECT',
          creatorId,
          // Both sides are ADMIN: there is no hierarchy in a conversation
          // between two people, and no member to administer.
          members: { create: pair.map((userId) => ({ userId, role: 'ADMIN' as const })) },
        },
        select: chatSelect,
      });

      return toChatDto(chat);
    });
  }

  private async createGroupChat(
    creatorId: string,
    input: Extract<CreateChatInput, { type: 'COURSE_GROUP' | 'CUSTOM_GROUP' }>
  ): Promise<ChatDto> {
    // Deduplicated, and the creator removed: they are added as ADMIN below, and
    // a repeated id would violate the composite primary key on ChatMember.
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

    return toChatDto(chat);
  }

  private async requireChat(chatId: string): Promise<ChatRow> {
    const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: chatSelect });

    if (!chat) {
      throw Errors.notFound(CHAT_NOT_FOUND);
    }

    return chat;
  }

  private assertChatAdmin(member: ChatMemberRow): void {
    if (member.role !== 'ADMIN') {
      throw Errors.forbidden(NOT_CHAT_ADMIN);
    }
  }
}

export const chatService = new ChatService();
