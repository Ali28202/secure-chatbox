import type { ChatRole, ChatType, GlobalRole } from './constants';

export interface PolicyUser {
  id: string;
  role: GlobalRole;
}
export interface PolicyChat {
  type: ChatType;
  isReadOnly: boolean;
  creatorId: string;
}
export interface PolicyMember {
  user: { id: string };
  role: ChatRole;
  isMuted: boolean;
}

export function isFaculty(user: PolicyUser): boolean {
  return user.role === 'PROFESSOR' || user.role === 'ADMIN';
}

export function canCreateChat(user: PolicyUser, type: ChatType): boolean {
  return type === 'COURSE_GROUP' ? isFaculty(user) : true;
}

export type SendBlock = 'MUTED' | 'READ_ONLY';

export const SEND_BLOCK_MESSAGES: Record<SendBlock, string> = {
  MUTED: 'شما در این گفت‌وگو بی‌صدا شده‌اید و نمی‌توانید پیام بفرستید.',
  READ_ONLY: 'این گفت‌وگو فقط‌خواندنی است.',
};

export function sendBlock(chat: PolicyChat, member: PolicyMember): SendBlock | null {
  if (member.isMuted) return 'MUTED';

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

/** Adding someone, removing someone else, or changing what they may do. */
export function canManageMembers(chat: PolicyChat, member: PolicyMember): boolean {
  return chat.type !== 'DIRECT' && member.role === 'ADMIN';
}

export function canUpdateMember(
  chat: PolicyChat,
  actor: PolicyMember,
  target: PolicyMember
): boolean {
  return canManageMembers(chat, actor) && actor.user.id !== target.user.id;
}

export function canMuteMember(
  chat: PolicyChat,
  actor: PolicyMember,
  target: PolicyMember
): boolean {
  return canUpdateMember(chat, actor, target) && target.role !== 'ADMIN';
}

export function canLeaveChat(
  chat: PolicyChat,
  member: PolicyMember,
  otherAdminCount: number
): boolean {
  if (chat.type === 'DIRECT') return false;

  return member.role !== 'ADMIN' || otherAdminCount > 0;
}
