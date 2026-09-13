import type { Prisma } from '@repo/database';
import type {
  AttachmentDto,
  ChatDto,
  ChatListItemDto,
  ChatMemberDto,
  MessageDto,
  MessageReactionDto,
  SessionDto,
  AdminUserDto,
  UserDto,
  UserSummaryDto,
} from '@repo/shared';
import type { ChatWatermarks } from './receipts';

export const userSummarySelect = {
  id: true,
  name: true,
  universityId: true,
  role: true,
  avatarKey: true,
} satisfies Prisma.UserSelect;

export const userSelect = {
  ...userSummarySelect,
  phoneNumber: true,
  status: true,
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
    // A boolean, not the key and not a URL: the key is private, and a signed
    // URL would expire inside a cached DTO. The client asks the redirect route.
    hasAvatar: user.avatarKey !== null,
  };
}

export function toUserDto(user: UserRow): UserDto {
  return {
    ...toUserSummaryDto(user),
    phoneNumber: user.phoneNumber,
    status: user.status,
    isActive: user.isActive,
    lastSeen: user.lastSeen?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export const adminUserSelect = {
  ...userSelect,
  reviewedAt: true,
  _count: { select: { memberships: true } },
} satisfies Prisma.UserSelect;

export type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

export function toAdminUserDto(user: AdminUserRow): AdminUserDto {
  return {
    ...toUserDto(user),
    reviewedAt: user.reviewedAt?.toISOString() ?? null,
    chatCount: user._count.memberships,
  };
}

export const sessionSelect = {
  id: true,
  deviceId: true,
  userAgent: true,
  ipAddress: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
} satisfies Prisma.SessionSelect;

export type SessionRow = Prisma.SessionGetPayload<{ select: typeof sessionSelect }>;

export function toSessionDto(session: SessionRow, currentSessionId: string): SessionDto {
  return {
    id: session.id,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    // Marked here rather than left to the client, so "this is the one you are
    // using" cannot disagree between the list and the button that ends it.
    isCurrent: session.id === currentSessionId,
  };
}

export const chatMemberSelect = {
  role: true,
  isMuted: true,
  joinedAt: true,
  user: { select: userSummarySelect },
} satisfies Prisma.ChatMemberSelect;

export type ChatMemberRow = Prisma.ChatMemberGetPayload<{ select: typeof chatMemberSelect }>;

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

const attachmentSelect = {
  id: true,
  fileName: true,
  fileType: true,
  fileSize: true,
} satisfies Prisma.AttachmentSelect;

const replyPreviewSelect = {
  id: true,
  content: true,
  isDeleted: true,
  sender: { select: { name: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.MessageSelect;

export const messageSelect = {
  id: true,
  chatId: true,
  content: true,
  isDeleted: true,
  isPinned: true,
  systemEvent: true,
  replyToId: true,
  createdAt: true,
  sender: { select: userSummarySelect },
  systemTarget: { select: userSummarySelect },
  replyTo: { select: replyPreviewSelect },
  attachments: { select: attachmentSelect, orderBy: { id: 'asc' } },
  reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: 'asc' } },
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

/** Rows in, one entry per emoji out, in first-reacted order. */
function toReactionDtos(rows: MessageRow['reactions']): MessageReactionDto[] {
  const byEmoji = new Map<string, string[]>();

  for (const { emoji, userId } of rows) {
    const userIds = byEmoji.get(emoji);
    if (userIds) userIds.push(userId);
    else byEmoji.set(emoji, [userId]);
  }

  return [...byEmoji].map(([emoji, userIds]) => ({ emoji, userIds }));
}

export function toMessageDto(message: MessageRow): MessageDto {
  return {
    id: message.id,
    chatId: message.chatId,
    sender: toUserSummaryDto(message.sender),
    content: message.isDeleted ? null : message.content,
    isDeleted: message.isDeleted,
    isPinned: message.isPinned,
    systemEvent: message.systemEvent,
    systemTarget: message.systemTarget ? toUserSummaryDto(message.systemTarget) : null,
    replyToId: message.replyToId,
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          senderName: message.replyTo.sender.name,
          content: message.replyTo.isDeleted ? null : message.replyTo.content,
          isDeleted: message.replyTo.isDeleted,
          attachmentCount: message.replyTo.isDeleted ? 0 : message.replyTo._count.attachments,
        }
      : null,
    attachments: message.isDeleted ? [] : message.attachments.map(toAttachmentDto),
    // A tombstone carries no reactions: the text is gone, so what they referred
    // to is gone with it.
    reactions: message.isDeleted ? [] : toReactionDtos(message.reactions),
    createdAt: message.createdAt.toISOString(),
  };
}

export const chatSelect = {
  id: true,
  type: true,
  title: true,
  isReadOnly: true,
  archivedAt: true,
  deletedAt: true,
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
    archivedAt: chat.archivedAt?.toISOString() ?? null,
    deletedAt: chat.deletedAt?.toISOString() ?? null,
    creatorId: chat.creatorId,
    lastMessageAt: chat.lastMessageAt?.toISOString() ?? null,
    createdAt: chat.createdAt.toISOString(),
  };
}

export const chatListSelect = {
  ...chatSelect,
  members: { select: chatMemberSelect, orderBy: { joinedAt: 'asc' } },
  messages: { select: messageSelect, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.ChatSelect;

export type ChatListRow = Prisma.ChatGetPayload<{ select: typeof chatListSelect }>;

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
