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

export const userSummarySelect = {
  id: true,
  name: true,
  universityId: true,
  role: true,
} satisfies Prisma.UserSelect;

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
    phoneNumber: user.phoneNumber,
    isActive: user.isActive,
    lastSeen: user.lastSeen?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
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
  replyToId: true,
  createdAt: true,
  sender: { select: userSummarySelect },
  replyTo: { select: replyPreviewSelect },
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
    content: message.isDeleted ? null : message.content,
    isDeleted: message.isDeleted,
    isPinned: message.isPinned,
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
