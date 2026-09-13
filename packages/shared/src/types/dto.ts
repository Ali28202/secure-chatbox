import type { AccountStatus, ChatRole, ChatType, GlobalRole, SystemEvent } from '../constants';
export interface UserSummaryDto {
  id: string;
  name: string;
  universityId: string;
  role: GlobalRole;
  /** Whether to fetch `/api/users/:id/avatar`. The key itself never leaves the API. */
  hasAvatar: boolean;
}

export interface UserDto extends UserSummaryDto {
  phoneNumber: string | null;
  status: AccountStatus;
  isActive: boolean;
  lastSeen: string | null;
  createdAt: string;
}

/** What the admin panel lists. Same row, plus who reviewed it and when. */
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

/** Never the device id: it is the session's secret half, not a label. */
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

/**
 * Who reacted, not how many — and deliberately not "did *I* react".
 *
 * `message:new` and `message:updated` are broadcast to a whole room as one
 * payload, so any field whose value depends on the reader would be wrong for
 * everyone but one person. The client counts the list and looks for its own id.
 */
export interface MessageReactionDto {
  emoji: string;
  userIds: string[];
}

/** A hit carries its conversation, because results span every chat you are in. */
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
  /** Set only for what the system recorded: who was added, who was removed. */
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
