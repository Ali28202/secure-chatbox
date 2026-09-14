import type { ChatRole, ChatType, GlobalRole } from './constants';

export interface PolicyUser {
  id: string;
  role: GlobalRole;
}
export interface PolicyChat {
  type: ChatType;
  isReadOnly: boolean;
  archivedAt: Date | string | null;
  creatorId: string;
}
export interface PolicyMember {
  user: { id: string; role: GlobalRole };
  role: ChatRole;
  isMuted: boolean;
}

export function isFaculty(user: PolicyUser): boolean {
  return user.role === 'PROFESSOR' || user.role === 'ADMIN';
}

export function isSystemAdmin(user: PolicyUser): boolean {
  return user.role === 'ADMIN';
}

export function canCreateChat(user: PolicyUser, type: ChatType): boolean {
  return type === 'COURSE_GROUP' ? isFaculty(user) : true;
}

export type SendBlock = 'MUTED' | 'READ_ONLY' | 'ARCHIVED';

export const SEND_BLOCK_MESSAGES: Record<SendBlock, string> = {
  MUTED: 'تو این گفت‌وگو بی‌صدا شدی و نمی‌تونی پیام بدی.',
  READ_ONLY: 'این گفت‌وگو فقط‌خواندنیه.',
  ARCHIVED: 'این گفت‌وگو آرشیو شده. برای پیام دادن باید از آرشیو درش بیاری.',
};

export function sendBlock(chat: PolicyChat, member: PolicyMember): SendBlock | null {
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

export function isChatCreator(chat: PolicyChat, userId: string): boolean {
  return chat.creatorId === userId;
}

export function canManageMembers(chat: PolicyChat, member: PolicyMember): boolean {
  if (chat.type === 'DIRECT') return false;
  if (isSystemAdmin(member.user)) return true;
  if (member.role !== 'ADMIN') return false;

  return isFaculty(member.user) || isChatCreator(chat, member.user.id);
}

export function canUpdateMember(
  chat: PolicyChat,
  actor: PolicyMember,
  target: PolicyMember
): boolean {
  if (!canManageMembers(chat, actor)) return false;

  if (actor.user.id === target.user.id) return false;

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

export function canArchiveChat(chat: PolicyChat, member: PolicyMember): boolean {
  return canManageMembers(chat, member);
}

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
