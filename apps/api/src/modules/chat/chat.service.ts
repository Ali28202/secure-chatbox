import { prisma } from '@repo/database';
import {
  canLeaveChat,
  canManageMembers,
  canMuteMember,
  canUpdateChat,
  canUpdateMember,
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
    if (!canManageMembers(chat, actor)) {
      throw Errors.forbidden(chat.type === 'DIRECT' ? DIRECT_IMMUTABLE : NOT_CHAT_ADMIN);
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
    const isSelf = actor.user.id === userId;

    if (isSelf) {
      // Counted only for an admin, and only their peers: this is the one rule
      // that needs to know about the rest of the member list, and for a member
      // walking out the answer is already yes.
      const otherAdmins =
        actor.role === 'ADMIN'
          ? await prisma.chatMember.count({
              where: { chatId: chat.id, role: 'ADMIN', userId: { not: userId } },
            })
          : 0;

      // The last admin leaving would orphan the group — a chat with no admin
      // can never be repaired from inside the app. This replaces the narrower
      // "the creator may not leave" rule: handing ADMIN to someone else through
      // `updateMember` is now the way out, and it is a better one, because the
      // creator was never the only person who could be left holding the chat.
      if (!canLeaveChat(chat, actor, otherAdmins)) {
        throw Errors.forbidden(
          chat.type === 'DIRECT'
            ? DIRECT_IMMUTABLE
            : 'پیش از ترک گفت‌وگو باید مدیریت آن را به عضو دیگری بسپارید.'
        );
      }
    } else if (!canManageMembers(chat, actor)) {
      throw Errors.forbidden(chat.type === 'DIRECT' ? DIRECT_IMMUTABLE : NOT_CHAT_ADMIN);
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
   * Renames a chat, or turns its read-only setting on and off.
   *
   * Read-only is the announcement mode a course group is really for: the
   * professor posts, the class reads, and the rule is enforced at send time
   * rather than by removing anyone. Direct chats are excluded — there is no
   * admin in a conversation between two people who are both admins.
   */
  async updateChat(chat: ChatRow, actor: ChatMemberRow, input: UpdateChatInput): Promise<ChatDto> {
    if (!canUpdateChat(chat, actor)) {
      throw Errors.forbidden(chat.type === 'DIRECT' ? DIRECT_IMMUTABLE : NOT_CHAT_ADMIN);
    }

    const updated = await prisma.chat.update({
      where: { id: chat.id },
      // Spread conditionally rather than passed through: `title: undefined`
      // means "leave it" to Prisma, but the same object reaching a future
      // caller that spreads it into a create would mean "null".
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.isReadOnly !== undefined ? { isReadOnly: input.isReadOnly } : {}),
      },
      select: chatSelect,
    });

    // The id alone — see `chat:updated` in the socket contract. The list row
    // this changes carries a per-viewer unread count, so there is no one
    // payload that is correct for everyone in the room.
    socketGateway.emitToChat(chat.id, 'chat:updated', chat.id);

    return toChatDto(updated);
  }

  /**
   * Changes what one member is in this chat: their role, whether they are
   * muted, or both.
   *
   * Acting on yourself is refused by the policy, and that is what keeps the
   * chat governable — an admin cannot demote or mute themselves, so no sequence
   * of legal calls leaves a group without an admin. Muting an admin is refused
   * for the same reason: it would be moderation aimed at the moderator.
   */
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
            : NOT_CHAT_ADMIN
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

    // Re-read rather than defaulted to null: `ChatMemberDto.lastReadAt` is what
    // draws this member's tick marks, and answering null would rewind them for
    // whoever applied this response to their cache.
    const watermarks = await readWatermarks([chat.id]);

    return toChatMemberDto(updated, watermarks.get(chat.id)?.get(userId) ?? null);
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
}

export const chatService = new ChatService();
