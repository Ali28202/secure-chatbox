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

export const userSelect = {
  ...userSummarySelect,
  isActive: true,
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

export function toChatMemberDto(member: ChatMemberRow): ChatMemberDto {
  return {
    user: toUserSummaryDto(member.user),
    role: member.role,
    isMuted: member.isMuted,
    joinedAt: member.joinedAt.toISOString(),
  };
}

const attachmentSelect = {
  id: true,
  fileName: true,
  fileUrl: true,
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
  attachments: { select: attachmentSelect },
} satisfies Prisma.MessageSelect;

export type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

function toAttachmentDto(attachment: MessageRow['attachments'][number]): AttachmentDto {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    fileUrl: attachment.fileUrl,
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

export function toChatListItemDto(chat: ChatListRow, unreadCount = 0): ChatListItemDto {
  const [lastMessage] = chat.messages;

  return {
    ...toChatDto(chat),
    members: chat.members.map(toChatMemberDto),
    lastMessage: lastMessage ? toMessageDto(lastMessage) : null,
    unreadCount,
  };
}
