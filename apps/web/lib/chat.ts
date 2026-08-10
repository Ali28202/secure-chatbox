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

/**
 * The other participant in a direct chat, from the viewer's side.
 *
 * Direct chats have no stored title — there is no one name that is right for
 * both people in them — so everything a client shows for one is derived from
 * whoever the viewer is *not*.
 */
export function getChatPeer(chat: ChatListItemDto, viewerId: string): UserSummaryDto | null {
  if (chat.type !== 'DIRECT') return null;
  return chat.members.find((member) => member.user.id !== viewerId)?.user ?? null;
}

export function getChatTitle(chat: ChatListItemDto, viewerId: string): string {
  if (chat.title) return chat.title;

  // A direct chat whose peer is missing means the other account was deleted.
  // Naming that state beats rendering an empty row nobody can interpret.
  return getChatPeer(chat, viewerId)?.name ?? 'کاربر حذف‌شده';
}

/**
 * What a message with no text is called, wherever it is summarised in one line
 * — the sidebar preview, the quote above a reply.
 *
 * Persian has no plural agreement here, so one form covers every count and the
 * number simply goes in front of the noun.
 */
export function getAttachmentSummary(count: number): string {
  return count === 1 ? 'یک پیوست' : `${toPersianDigits(count)} پیوست`;
}

/**
 * The preview line under a chat's name.
 *
 * A group prefixes the sender, since "who said it" is half the information;
 * a direct chat does not, because there are only two candidates and one of them
 * is you.
 */
export function getChatPreview(chat: ChatListItemDto, viewerId: string): string {
  const message = chat.lastMessage;

  if (!message) return 'هنوز پیامی رد و بدل نشده است.';
  if (message.isDeleted) return 'این پیام حذف شده است.';

  const body =
    message.content ??
    (message.attachments.length > 0 ? getAttachmentSummary(message.attachments.length) : '');

  if (chat.type === 'DIRECT') return body;

  const sender = message.sender.id === viewerId ? 'شما' : message.sender.name;
  return `${sender}: ${body}`;
}

/** Members other than the viewer, which is what a member list should show. */
export function getOtherMembers(members: ChatMemberDto[], viewerId: string): ChatMemberDto[] {
  return members.filter((member) => member.user.id !== viewerId);
}
