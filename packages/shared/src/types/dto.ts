import type { ChatRole, ChatType, GlobalRole } from '../constants';
export interface UserSummaryDto {
  id: string;
  name: string;
  universityId: string;
  role: GlobalRole;
}

export interface UserDto extends UserSummaryDto {
  phoneNumber: string | null;
  isActive: boolean;
  lastSeen: string | null;
  createdAt: string;
}

export interface ChatMemberDto {
  user: UserSummaryDto;
  role: ChatRole;
  isMuted: boolean;
  joinedAt: string;
  lastReadAt: string | null;
}

export interface ChatDto {
  id: string;
  type: ChatType;
  title: string | null;
  isReadOnly: boolean;
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

export interface MessageDto {
  id: string;
  chatId: string;
  sender: UserSummaryDto;
  content: string | null;
  isDeleted: boolean;
  isPinned: boolean;
  replyToId: string | null;
  replyTo: MessageReplyDto | null;
  attachments: AttachmentDto[];
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
