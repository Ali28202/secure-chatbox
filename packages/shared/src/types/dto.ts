import type { ChatRole, ChatType, GlobalRole } from '../constants';

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

/**
 * The full account, returned only to the person it belongs to.
 *
 * The extra fields over `UserSummaryDto` are the reason it stays separate:
 * `phoneNumber` is a login identifier and a way to reach someone off-platform,
 * and neither belongs in the member list of every chat you happen to share.
 */
export interface UserDto extends UserSummaryDto {
  /** Null for accounts that predate the phone-number identifier. */
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
  /**
   * How far this member has read: the `createdAt` of the newest message they
   * have a READ receipt for, or null if they have read nothing.
   *
   * A watermark rather than a count, because counts don't survive the realtime
   * path. Two overlapping read ranges arriving over the socket would each add
   * their own total and double-count; a watermark applied twice is the same
   * watermark. A message is read by this member iff `lastReadAt >= createdAt`.
   */
  lastReadAt: string | null;
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
  /**
   * How many files the quoted message carried — a count, not the files
   * themselves, because the quote is one line of grey text and never renders
   * them. Without it a reply to a caption-less photo quotes a blank.
   */
  attachmentCount: number;
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

/**
 * The pinned messages of a chat.
 *
 * An object rather than a bare array, matching every other list the API
 * answers with: a top-level JSON array cannot grow a field later without
 * breaking every client that indexed into it.
 */
export interface PinnedMessagesDto {
  messages: MessageDto[];
}

/**
 * What `POST /chats/:chatId/messages/read` answers.
 *
 * `unreadCount` is recomputed rather than assumed to be zero: the client marks
 * up to the newest message it has *seen*, and messages that arrived below the
 * fold while it was scrolling are still unread.
 */
export interface MarkReadResultDto {
  chatId: string;
  upToMessageId: string;
  readAt: string;
  unreadCount: number;
}
