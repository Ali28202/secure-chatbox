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

/**
 * The platform's operator, not a chat's moderator.
 *
 * Every rule below lets them through. The one line they do not cross is a
 * `DIRECT` conversation: two people writing to each other are peers, there is
 * nothing there to administer, and the difference between running a university's
 * groups and reading its private correspondence is the whole point.
 */
export function isSystemAdmin(user: PolicyUser): boolean {
  return user.role === 'ADMIN';
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
  // Archiving comes first even for the operator: it is a statement that the
  // conversation is over rather than a permission, it applies to everyone, and
  // undoing it is one click away in the same menu.
  if (chat.archivedAt !== null) return 'ARCHIVED';

  if (isSystemAdmin(member.user)) return null;

  if (member.isMuted) return 'MUTED';

  if (chat.isReadOnly && member.role !== 'ADMIN') return 'READ_ONLY';

  return null;
}

export function canSendMessage(chat: PolicyChat, member: PolicyMember): boolean {
  return sendBlock(chat, member) === null;
}

export function canDeleteMessage(member: PolicyMember, senderId: string): boolean {
  return member.user.id === senderId || member.role === 'ADMIN' || isSystemAdmin(member.user);
}

export function canPinMessage(member: PolicyMember): boolean {
  return member.role === 'ADMIN' || isSystemAdmin(member.user);
}

export function canUpdateChat(chat: PolicyChat, member: PolicyMember): boolean {
  if (chat.type === 'DIRECT') return false;

  return member.role === 'ADMIN' || isSystemAdmin(member.user);
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
  if (isSystemAdmin(member.user)) return true;
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

  // Still never yourself, operator or not: an admin who could demote themselves
  // could leave a group with nobody able to run it.
  if (actor.user.id === target.user.id) return false;

  // The creator's seat is protected from the chat's own admins, not from the
  // platform's. Someone has to be able to put a group right.
  if (isSystemAdmin(actor.user)) return true;

  return !isChatCreator(chat, target.user.id);
}

export function canMuteMember(
  chat: PolicyChat,
  actor: PolicyMember,
  target: PolicyMember
): boolean {
  if (!canUpdateMember(chat, actor, target)) return false;

  return isSystemAdmin(actor.user) || target.role !== 'ADMIN';
}

/**
 * Archiving hides the conversation for everyone in it, so it is gated like the
 * roster rather than like the title: faculty, or the person who made it. An
 * admin a student promoted cannot retire someone else's group.
 */
export function canArchiveChat(chat: PolicyChat, member: PolicyMember): boolean {
  return canManageMembers(chat, member);
}

/** Same gate as archiving: it takes the conversation away from everyone in it. */
export function canDeleteChat(chat: PolicyChat, member: PolicyMember): boolean {
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
