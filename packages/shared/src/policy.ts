import type { ChatRole, ChatType, GlobalRole } from './constants';

export interface PolicyUser {
  id: string;
  role: GlobalRole;
}
export interface PolicyChat {
  type: ChatType;
  isReadOnly: boolean;
  /**
   * A timestamp, not a boolean, and a union because these rules run on both
   * sides: the API hands in a Prisma row where this is a `Date`, the browser
   * hands in the DTO where it is an ISO string. Keeping one field name in both
   * shapes is what lets a single pure function serve both without an adapter.
   */
  archivedAt: Date | string | null;
  creatorId: string;
}
export interface PolicyMember {
  /** `role` here is the *global* role, not the chat one below. Managing members
   * asks about both: whether you are staff, and whether you run this chat. */
  user: { id: string; role: GlobalRole };
  role: ChatRole;
  isMuted: boolean;
}

export function isFaculty(user: PolicyUser): boolean {
  return user.role === 'PROFESSOR' || user.role === 'ADMIN';
}

export function canCreateChat(user: PolicyUser, type: ChatType): boolean {
  return type === 'COURSE_GROUP' ? isFaculty(user) : true;
}

export type SendBlock = 'MUTED' | 'READ_ONLY' | 'ARCHIVED';

export const SEND_BLOCK_MESSAGES: Record<SendBlock, string> = {
  MUTED: 'شما در این گفت‌وگو بی‌صدا شده‌اید و نمی‌توانید پیام بفرستید.',
  READ_ONLY: 'این گفت‌وگو فقط‌خواندنی است.',
  ARCHIVED: 'این گفت‌وگو آرشیو شده است. برای فرستادن پیام باید از آرشیو خارج شود.',
};

export function sendBlock(chat: PolicyChat, member: PolicyMember): SendBlock | null {
  if (member.isMuted) return 'MUTED';

  // Ahead of the read-only check, and it has no admin exemption: read-only is a
  // rule about who may speak, archiving is a statement that the conversation is
  // over. An admin who wants to speak again restores it first.
  if (chat.archivedAt !== null) return 'ARCHIVED';

  if (chat.isReadOnly && member.role !== 'ADMIN') return 'READ_ONLY';

  return null;
}

export function canSendMessage(chat: PolicyChat, member: PolicyMember): boolean {
  return sendBlock(chat, member) === null;
}

export function canDeleteMessage(member: PolicyMember, senderId: string): boolean {
  return member.user.id === senderId || member.role === 'ADMIN';
}

export function canPinMessage(member: PolicyMember): boolean {
  return member.role === 'ADMIN';
}

export function canUpdateChat(chat: PolicyChat, member: PolicyMember): boolean {
  return chat.type !== 'DIRECT' && member.role === 'ADMIN';
}

/** The person who made the chat. Their admin seat is permanent — see below. */
export function isChatCreator(chat: PolicyChat, userId: string): boolean {
  return chat.creatorId === userId;
}

/**
 * Adding someone, removing someone else, or changing what they may do.
 *
 * Two locks, not one. Running the chat (`ADMIN`) is necessary but not enough:
 * the roster is also gated on *who you are*. Faculty may manage any chat they
 * administer; a student may manage only the one they made themselves. So a
 * student promoted to admin in someone else's group can moderate messages but
 * cannot quietly widen the audience — which is the part that leaks history,
 * because a new member can read everything said before they arrived.
 */
export function canManageMembers(chat: PolicyChat, member: PolicyMember): boolean {
  if (chat.type === 'DIRECT') return false;
  if (member.role !== 'ADMIN') return false;

  return isFaculty(member.user) || isChatCreator(chat, member.user.id);
}

/**
 * Nobody may demote, mute or remove the creator — not even another admin.
 *
 * Without this the admin bit is a loaded gun pointed at whoever fired first:
 * you promote someone to share the work, and they can immediately demote you
 * out of your own group. Promotion should never be irreversible for the person
 * granting it.
 */
export function canUpdateMember(
  chat: PolicyChat,
  actor: PolicyMember,
  target: PolicyMember
): boolean {
  if (!canManageMembers(chat, actor)) return false;
  if (actor.user.id === target.user.id) return false;

  return !isChatCreator(chat, target.user.id);
}

export function canMuteMember(
  chat: PolicyChat,
  actor: PolicyMember,
  target: PolicyMember
): boolean {
  return canUpdateMember(chat, actor, target) && target.role !== 'ADMIN';
}

/**
 * Archiving hides the conversation for everyone in it, so it is gated like the
 * roster rather than like the title: faculty, or the person who made it. An
 * admin a student promoted cannot retire someone else's group.
 */
export function canArchiveChat(chat: PolicyChat, member: PolicyMember): boolean {
  return canManageMembers(chat, member);
}

export function canLeaveChat(
  chat: PolicyChat,
  member: PolicyMember,
  otherAdminCount: number
): boolean {
  if (chat.type === 'DIRECT') return false;

  return member.role !== 'ADMIN' || otherAdminCount > 0;
}
