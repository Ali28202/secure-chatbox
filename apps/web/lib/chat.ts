import {
  toPersianDigits,
  type ChatListItemDto,
  type ChatMemberDto,
  type ChatType,
  type UserSummaryDto,
} from '@repo/shared';

export const CHAT_TYPE_LABELS: Record<ChatType, string> = {
  DIRECT: 'گفت‌وگوی خصوصی',
  COURSE_GROUP: 'گروه درسی',
  CUSTOM_GROUP: 'گروه',
};

export function getChatPeer(chat: ChatListItemDto, viewerId: string): UserSummaryDto | null {
  if (chat.type !== 'DIRECT') return null;
  return chat.members.find((member) => member.user.id !== viewerId)?.user ?? null;
}

export function getChatTitle(chat: ChatListItemDto, viewerId: string): string {
  if (chat.title) return chat.title;

  return getChatPeer(chat, viewerId)?.name ?? 'کاربر حذف‌شده';
}

export function getAttachmentSummary(count: number): string {
  return count === 1 ? 'یک پیوست' : `${toPersianDigits(count)} پیوست`;
}

export function getChatPreview(chat: ChatListItemDto, viewerId: string): string {
  const message = chat.lastMessage;

  if (!message) return 'هنوز پیامی فرستاده نشده.';
  if (message.isDeleted) return 'این پیام حذف شده.';

  // A system note has no content, so the ordinary path would render a sender
  // name followed by nothing. Say what actually happened instead.
  if (message.systemEvent !== null) {
    const target = message.systemTarget?.name ?? 'یک کاربر';
    return message.systemEvent === 'MEMBER_ADDED'
      ? `${target} به گروه اضافه شد`
      : `${target} از گروه حذف شد`;
  }

  const body =
    message.content ??
    (message.attachments.length > 0 ? getAttachmentSummary(message.attachments.length) : '');

  if (chat.type === 'DIRECT') return body;

  const sender = message.sender.id === viewerId ? 'شما' : message.sender.name;
  return `${sender}: ${body}`;
}

export function getOtherMembers(members: ChatMemberDto[], viewerId: string): ChatMemberDto[] {
  return members.filter((member) => member.user.id !== viewerId);
}
