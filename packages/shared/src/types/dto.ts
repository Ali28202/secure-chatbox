import type { AccountStatus, ChatRole, ChatType, GlobalRole, SystemEvent } from '../constants';
export interface UserSummaryDto {
  id: string;
  name: string;
  universityId: string;
  role: GlobalRole;
  hasAvatar: boolean;
}

export interface UserDto extends UserSummaryDto {
  phoneNumber: string | null;
  status: AccountStatus;
  isActive: boolean;
  lastSeen: string | null;
  createdAt: string;
}

export interface AdminUserDto extends UserDto {
  reviewedAt: string | null;
  chatCount: number;
}

export interface AdminUsersDto {
  users: AdminUserDto[];
  total: number;
}

export interface ChatMemberDto {
  user: UserSummaryDto;
  role: ChatRole;
  isMuted: boolean;
  joinedAt: string;
  lastReadAt: string | null;
}

export interface SessionDto {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface SessionsDto {
  sessions: SessionDto[];
}

export interface ChatDto {
  id: string;
  type: ChatType;
  title: string | null;
  isReadOnly: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
  creatorId: string;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface ChatListItemDto extends ChatDto {
  members: ChatMemberDto[];
  lastMessage: MessageDto | null;
  unreadCount: number;
}

export interface AttachmentDto {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export interface MessageReplyDto {
  id: string;
  senderName: string;
  content: string | null;
  isDeleted: boolean;
  attachmentCount: number;
}

export interface MessageReactionDto {
  emoji: string;
  userIds: string[];
}

export interface MessageSearchHitDto {
  message: MessageDto;
  chatId: string;
  chatTitle: string | null;
  chatType: ChatType;
}

export interface MessageSearchResultsDto {
  hits: MessageSearchHitDto[];
}

export interface MessageDto {
  id: string;
  chatId: string;
  sender: UserSummaryDto;
  content: string | null;
  isDeleted: boolean;
  isPinned: boolean;
  systemEvent: SystemEvent | null;
  systemTarget: UserSummaryDto | null;
  replyToId: string | null;
  replyTo: MessageReplyDto | null;
  attachments: AttachmentDto[];
  reactions: MessageReactionDto[];
  createdAt: string;
}

export interface MessagePageDto {
  messages: MessageDto[];
  nextCursor: string | null;
}

export interface PinnedMessagesDto {
  messages: MessageDto[];
}

export interface MarkReadResultDto {
  chatId: string;
  upToMessageId: string;
  readAt: string;
  unreadCount: number;
}
