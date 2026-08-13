import type { Prisma } from '@repo/database';
import type {
  AttachmentDto,
  ChatDto,
  ChatListItemDto,
  ChatMemberDto,
  MessageDto,
  UserDto,
  UserSummaryDto,
} from '@repo/shared';
import type { ChatWatermarks } from './receipts';

/**
 * Row → DTO translation, and the `select` clauses that produce those rows.
 *
 * The two belong together: the select is what guarantees `passwordHash` is
 * never even read out of the database on a normal request, and the mapper is
 * what guarantees the shape matches the contract in `@repo/shared`. Splitting
 * them across files is how a column quietly starts leaking.
 */

export const userSummarySelect = {
  id: true,
  name: true,
  universityId: true,
  role: true,
} satisfies Prisma.UserSelect;

/**
 * The full row, for the account looking at its own session.
 *
 * `deviceId` is read but never mapped into the DTO below. It is here because
 * `AuthService` needs it on every verified request — it is the value a token's
 * `did` claim is checked against — and reading it in the same query that loads
 * the user is what keeps that check free.
 */
export const userSelect = {
  ...userSummarySelect,
  phoneNumber: true,
  isActive: true,
  deviceId: true,
  lastSeen: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type UserSummaryRow = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;
export type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export function toUserSummaryDto(user: UserSummaryRow): UserSummaryDto {
  return {
    id: user.id,
    name: user.name,
    universityId: user.universityId,
    role: user.role,
  };
}

export function toUserDto(user: UserRow): UserDto {
  return {
    ...toUserSummaryDto(user),
    // Only ever produced for the account making the request — the people
    // directory answers with `UserSummaryDto`, which has no phone number in it.
    // Browsing a university's user list should not be a way to collect them.
    phoneNumber: user.phoneNumber,
    isActive: user.isActive,
    lastSeen: user.lastSeen?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const chatMemberSelect = {
  role: true,
  isMuted: true,
  joinedAt: true,
  user: { select: userSummarySelect },
} satisfies Prisma.ChatMemberSelect;

export type ChatMemberRow = Prisma.ChatMemberGetPayload<{ select: typeof chatMemberSelect }>;

/**
 * `lastReadAt` is passed in rather than selected: it is an aggregate over this
 * member's receipts, which no `select` on `ChatMember` can reach. `readWatermarks`
 * computes them for a whole chat at once — see `lib/receipts.ts`.
 *
 * Defaulting to null is correct for the one caller that has no watermarks to
 * give: a member who was just added has read nothing.
 */
export function toChatMemberDto(
  member: ChatMemberRow,
  lastReadAt: Date | null = null
): ChatMemberDto {
  return {
    user: toUserSummaryDto(member.user),
    role: member.role,
    isMuted: member.isMuted,
    joinedAt: member.joinedAt.toISOString(),
    lastReadAt: lastReadAt?.toISOString() ?? null,
  };
}

/**
 * Where the bytes actually are is not in here.
 *
 * `s3Bucket` and `s3ObjectKey` stay server-side: a client that knew them could
 * name an object directly, and the whole download design is that it cannot —
 * it asks for an attachment by id and the API decides, every time, whether to
 * sign for it.
 */
const attachmentSelect = {
  id: true,
  fileName: true,
  fileType: true,
  fileSize: true,
} satisfies Prisma.AttachmentSelect;

/**
 * Just enough of the quoted message to draw the line above a reply.
 *
 * One level deep and no further: `replyTo.replyTo` would recurse down the whole
 * chain and fetch a conversation's worth of rows to render one grey line.
 */
const replyPreviewSelect = {
  id: true,
  content: true,
  isDeleted: true,
  sender: { select: { name: true } },
  // A count, not the rows: the quote is one line of text that never renders a
  // file, and it only needs to know whether — and how many — there were.
  _count: { select: { attachments: true } },
} satisfies Prisma.MessageSelect;

export const messageSelect = {
  id: true,
  chatId: true,
  content: true,
  isDeleted: true,
  isPinned: true,
  replyToId: true,
  createdAt: true,
  sender: { select: userSummarySelect },
  replyTo: { select: replyPreviewSelect },
  // Ordered, because unordered is whatever Postgres feels like returning: two
  // requests for the same message could hand the client its three photos in two
  // different orders. The id is a UUIDv7, so ascending is the order they were
  // attached in — which is the order they were picked in.
  attachments: { select: attachmentSelect, orderBy: { id: 'asc' } },
} satisfies Prisma.MessageSelect;

export type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

function toAttachmentDto(attachment: MessageRow['attachments'][number]): AttachmentDto {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    fileType: attachment.fileType,
    fileSize: attachment.fileSize,
  };
}

export function toMessageDto(message: MessageRow): MessageDto {
  return {
    id: message.id,
    chatId: message.chatId,
    sender: toUserSummaryDto(message.sender),
    // A soft-deleted row keeps its place so replies still resolve, but its text
    // must not travel: `isDeleted` is the client's cue to render a tombstone.
    content: message.isDeleted ? null : message.content,
    isDeleted: message.isDeleted,
    isPinned: message.isPinned,
    replyToId: message.replyToId,
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          senderName: message.replyTo.sender.name,
          // The same rule one level down: a deleted message's text stays on the
          // server whether it is being read directly or quoted by a reply.
          content: message.replyTo.isDeleted ? null : message.replyTo.content,
          isDeleted: message.replyTo.isDeleted,
          attachmentCount: message.replyTo.isDeleted ? 0 : message.replyTo._count.attachments,
        }
      : null,
    attachments: message.isDeleted ? [] : message.attachments.map(toAttachmentDto),
    createdAt: message.createdAt.toISOString(),
  };
}

export const chatSelect = {
  id: true,
  type: true,
  title: true,
  isReadOnly: true,
  creatorId: true,
  lastMessageAt: true,
  createdAt: true,
} satisfies Prisma.ChatSelect;

export type ChatRow = Prisma.ChatGetPayload<{ select: typeof chatSelect }>;

export function toChatDto(chat: ChatRow): ChatDto {
  return {
    id: chat.id,
    type: chat.type,
    title: chat.title,
    isReadOnly: chat.isReadOnly,
    creatorId: chat.creatorId,
    lastMessageAt: chat.lastMessageAt?.toISOString() ?? null,
    createdAt: chat.createdAt.toISOString(),
  };
}

/**
 * A chat with everything the sidebar draws: who is in it (a direct chat has no
 * stored title, so the client titles it from the other member) and the latest
 * message as a preview line.
 */
export const chatListSelect = {
  ...chatSelect,
  members: { select: chatMemberSelect, orderBy: { joinedAt: 'asc' } },
  messages: { select: messageSelect, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.ChatSelect;

export type ChatListRow = Prisma.ChatGetPayload<{ select: typeof chatListSelect }>;

/**
 * Read state arrives as one argument because it is fetched for every chat in
 * the response at once, not per chat — two queries for a sidebar of any size.
 */
export function toChatListItemDto(
  chat: ChatListRow,
  read: { unreadCount?: number; watermarks?: ChatWatermarks } = {}
): ChatListItemDto {
  const [lastMessage] = chat.messages;

  return {
    ...toChatDto(chat),
    members: chat.members.map((member) =>
      toChatMemberDto(member, read.watermarks?.get(member.user.id) ?? null)
    ),
    lastMessage: lastMessage ? toMessageDto(lastMessage) : null,
    unreadCount: read.unreadCount ?? 0,
  };
}
