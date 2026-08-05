import type { ChatRole, ChatType, GlobalRole, ReceiptStatus } from '../constants';

/**
 * The shapes the API actually returns.
 *
 * These are written by hand rather than derived from the Prisma models on
 * purpose. Prisma types would drag `@repo/database` into `apps/web`, and they
 * describe database rows — including `passwordHash` — not responses. Keeping
 * them separate means a field is only ever exposed because someone chose to
 * put it here.
 *
 * All timestamps are ISO 8601 strings: they have already been through JSON by
 * the time a client sees them.
 */

/** The compact form embedded in messages and member lists. */
export interface UserSummaryDto {
  id: string;
  name: string;
  universityId: string;
  role: GlobalRole;
}

export interface UserDto extends UserSummaryDto {
  isActive: boolean;
  lastSeen: string | null;
  createdAt: string;
}

export interface ChatMemberDto {
  user: UserSummaryDto;
  role: ChatRole;
  isMuted: boolean;
  joinedAt: string;
}

export interface ChatDto {
  id: string;
  type: ChatType;
  /** Null for direct chats, which are titled from the other member's name. */
  title: string | null;
  isReadOnly: boolean;
  creatorId: string;
  lastMessageAt: string | null;
  createdAt: string;
}

/** A chat as it appears in the sidebar, with the extras that list view needs. */
export interface ChatListItemDto extends ChatDto {
  members: ChatMemberDto[];
  lastMessage: MessageDto | null;
  unreadCount: number;
}

export interface AttachmentDto {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

/**
 * The quoted line a reply renders above itself.
 *
 * It travels with the reply rather than being resolved client-side, because the
 * message being answered is often far outside the loaded page — a reply to
 * something from last week would otherwise quote a blank.
 */
export interface MessageReplyDto {
  id: string;
  senderName: string;
  /** Null when the quoted message was deleted, by the same rule as below. */
  content: string | null;
  isDeleted: boolean;
}

export interface MessageDto {
  id: string;
  chatId: string;
  sender: UserSummaryDto;
  /** Null once soft-deleted — the row survives so reply chains stay intact. */
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
  /** Cursor for the next (older) page; null when the start has been reached. */
  nextCursor: string | null;
}

export interface ReceiptDto {
  messageId: string;
  userId: string;
  status: ReceiptStatus;
  updatedAt: string;
}
