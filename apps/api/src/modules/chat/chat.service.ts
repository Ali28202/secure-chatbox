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
import { countUnread, readWatermarks } from '../../lib/receipts';
import { socketGateway } from '../../socket/gateway';

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

    // Two queries for the whole sidebar rather than two per chat: both take the
    // full list of ids and come back keyed by chat.
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

  /** One chat, in the same shape as the list, provided the user is a member. */
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

  /**
   * Adds someone to a group. Direct chats are excluded by definition: a
   * two-person conversation that grows a third participant is a different
   * thing, and the pair-uniqueness below depends on it never happening.
   */
  async addMember(
    chat: ChatRow,
    actor: ChatMemberRow,
    input: AddMemberInput
  ): Promise<ChatMemberDto> {
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

    // Their already-open tabs joined their rooms when they connected, which was
    // before this membership existed. Without this they would receive nothing
    // from the chat until they reloaded.
    await socketGateway.joinChat(chat.id, input.userId);

    return toChatMemberDto(member);
  }

  /**
   * Removes a member, or lets one leave.
   *
   * Leaving is the case that keeps this from being an admin-only operation:
   * nobody should need permission to walk out of a conversation. Removing
   * *someone else* is an admin action.
   */
  async removeMember(chat: ChatRow, actor: ChatMemberRow, userId: string): Promise<void> {
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

    const deleted = await prisma.chatMember.deleteMany({ where: { chatId: chat.id, userId } });

    if (deleted.count === 0) {
      throw Errors.notFound('این کاربر عضو گفت‌وگو نیست.');
    }

    // Otherwise their sockets keep receiving messages from a chat the API would
    // now answer 404 for — the room outlives the membership that justified it.
    socketGateway.leaveChat(chat.id, userId);
  }

  /**
   * Resolves a user's membership in a chat, or nothing.
   *
   * Returning `null` rather than throwing is what lets `requireChatMember`
   * answer 404 for a chat that exists but is none of your business — see the
   * middleware for why that distinction is worth the extra branch.
   *
   * The chat travels back with the membership because every caller needs both
   * and the membership row already knows the way there: fetching them together
   * costs one query, and the alternative is each service re-reading a chat the
   * middleware has already proven the caller can see.
   */
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
          // Both sides are ADMIN: there is no hierarchy in a conversation
          // between two people, and no member to administer.
          members: { create: pair.map((userId) => ({ userId, role: 'ADMIN' as const })) },
        },
        select: chatSelect,
      });

      return { chat: created, isNew: true };
    });

    // Only for a chat that was actually created. Re-opening an existing
    // conversation puts nobody in a room they are not already in, and the
    // presence announcement `joinChat` carries would fire again for nothing.
    if (isNew) await this.openRooms(chat.id, pair);

    return toChatDto(chat);
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

    await this.openRooms(chat.id, [creatorId, ...memberIds]);

    return toChatDto(chat);
  }

  /**
   * Puts everyone who is currently connected into the new chat's room.
   *
   * Done here rather than left to the clients: the creator gets the chat in
   * their HTTP response and could ask to join it themselves, but nobody else
   * has any idea the chat now exists.
   */
  private async openRooms(chatId: string, userIds: string[]): Promise<void> {
    await Promise.all(userIds.map((userId) => socketGateway.joinChat(chatId, userId)));
  }

  private assertChatAdmin(member: ChatMemberRow): void {
    if (member.role !== 'ADMIN') {
      throw Errors.forbidden(NOT_CHAT_ADMIN);
    }
  }
}

export const chatService = new ChatService();
