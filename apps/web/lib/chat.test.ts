import type { ChatListItemDto, ChatMemberDto, MessageDto } from '@repo/shared';
import { describe, expect, it } from 'vitest';
import {
  getAttachmentSummary,
  getChatPeer,
  getChatPreview,
  getChatTitle,
  getOtherMembers,
} from '@/lib/chat';

/**
 * Everything the sidebar says about a chat before a single component renders.
 *
 * All of it turns on one asymmetry: a direct chat has no stored title, because
 * there is no one name that is right for both people in it. So its name, its
 * preview and its member list are all derived from *who the viewer is not* —
 * which makes `viewerId` the argument every one of these is really about.
 */

const VIEWER = 'viewer-id';
const PEER = 'peer-id';

const user = (id: string, name: string) => ({
  id,
  name,
  universityId: id === VIEWER ? '40012301' : '900101',
  role: id === VIEWER ? ('STUDENT' as const) : ('PROFESSOR' as const),
});

const member = (id: string, name: string): ChatMemberDto => ({
  user: user(id, name),
  role: 'MEMBER',
  isMuted: false,
  joinedAt: '2026-08-01T08:00:00.000Z',
  lastReadAt: null,
});

const message = (overrides: Partial<MessageDto> = {}): MessageDto =>
  ({
    id: 'message-1',
    chatId: 'chat-1',
    sender: user(PEER, 'دکتر آقایی'),
    content: 'جلسهٔ فردا لغو شد',
    isDeleted: false,
    isPinned: false,
    replyToId: null,
    replyTo: null,
    attachments: [],
    createdAt: '2026-08-11T09:00:00.000Z',
    ...overrides,
  }) as MessageDto;

const chat = (overrides: Partial<ChatListItemDto> = {}): ChatListItemDto =>
  ({
    id: 'chat-1',
    type: 'DIRECT',
    title: null,
    isReadOnly: false,
    creatorId: PEER,
    lastMessageAt: '2026-08-11T09:00:00.000Z',
    createdAt: '2026-08-01T08:00:00.000Z',
    members: [member(VIEWER, 'علی محلاتی'), member(PEER, 'دکتر آقایی')],
    lastMessage: message(),
    unreadCount: 0,
    ...overrides,
  }) as ChatListItemDto;

const attachment = {
  id: 'attachment-1',
  fileName: 'گزارش.pdf',
  fileType: 'application/pdf',
  fileSize: 1024,
};

describe('getChatPeer', () => {
  it('finds the other participant in a direct chat', () => {
    expect(getChatPeer(chat(), VIEWER)?.id).toBe(PEER);
  });

  it('returns nothing for a group, where there is no single peer', () => {
    expect(getChatPeer(chat({ type: 'COURSE_GROUP', title: 'مبانی' }), VIEWER)).toBeNull();
  });

  it('returns nothing when the other account is gone', () => {
    const orphaned = chat({ members: [member(VIEWER, 'علی محلاتی')] });
    expect(getChatPeer(orphaned, VIEWER)).toBeNull();
  });
});

describe('getChatTitle', () => {
  it('uses the stored title when a group has one', () => {
    expect(getChatTitle(chat({ type: 'COURSE_GROUP', title: 'مبانی برنامه‌نویسی' }), VIEWER)).toBe(
      'مبانی برنامه‌نویسی'
    );
  });

  it('titles a direct chat with the other person’s name', () => {
    expect(getChatTitle(chat(), VIEWER)).toBe('دکتر آقایی');
  });

  it('gives each side of the same chat a different title', () => {
    // The reason the title is not stored on the row.
    expect(getChatTitle(chat(), VIEWER)).toBe('دکتر آقایی');
    expect(getChatTitle(chat(), PEER)).toBe('علی محلاتی');
  });

  it('names the deleted-account state rather than rendering an empty row', () => {
    const orphaned = chat({ members: [member(VIEWER, 'علی محلاتی')] });
    expect(getChatTitle(orphaned, VIEWER)).toBe('کاربر حذف‌شده');
  });
});

describe('getAttachmentSummary', () => {
  it('says "one" in words for a single file', () => {
    expect(getAttachmentSummary(1)).toBe('یک پیوست');
  });

  it('uses Persian numerals for the rest', () => {
    // Persian has no plural agreement here, so the noun never changes.
    expect(getAttachmentSummary(3)).toBe('۳ پیوست');
    expect(getAttachmentSummary(12)).toBe('۱۲ پیوست');
  });
});

describe('getChatPreview', () => {
  it('invites the first message when there is none', () => {
    expect(getChatPreview(chat({ lastMessage: null }), VIEWER)).toBe(
      'هنوز پیامی رد و بدل نشده است.'
    );
  });

  it('shows a tombstone instead of the deleted text', () => {
    // The API already sends `content: null` for these; this is the second half
    // of the same rule, on the side that draws it.
    const deleted = chat({ lastMessage: message({ isDeleted: true, content: null }) });
    expect(getChatPreview(deleted, VIEWER)).toBe('این پیام حذف شده است.');
  });

  it('shows a direct chat’s message with no prefix', () => {
    // Only two candidates and one of them is you, so naming the sender wastes
    // half the line.
    expect(getChatPreview(chat(), VIEWER)).toBe('جلسهٔ فردا لغو شد');
  });

  it('prefixes the sender in a group', () => {
    const group = chat({ type: 'COURSE_GROUP', title: 'مبانی' });
    expect(getChatPreview(group, VIEWER)).toBe('دکتر آقایی: جلسهٔ فردا لغو شد');
  });

  it('calls the viewer "شما" rather than repeating their own name', () => {
    const group = chat({
      type: 'COURSE_GROUP',
      title: 'مبانی',
      lastMessage: message({ sender: user(VIEWER, 'علی محلاتی'), content: 'ممنون استاد' }),
    });
    expect(getChatPreview(group, VIEWER)).toBe('شما: ممنون استاد');
  });

  it('describes an attachment when there is no caption', () => {
    const withFile = chat({
      lastMessage: message({ content: null, attachments: [attachment] } as Partial<MessageDto>),
    });
    expect(getChatPreview(withFile, VIEWER)).toBe('یک پیوست');
  });

  it('prefers the caption over the attachment count', () => {
    const captioned = chat({
      lastMessage: message({
        content: 'این هم گزارش',
        attachments: [attachment],
      } as Partial<MessageDto>),
    });
    expect(getChatPreview(captioned, VIEWER)).toBe('این هم گزارش');
  });

  it('degrades to an empty body rather than printing "undefined"', () => {
    // A message with neither text nor files should not be possible, but the
    // sidebar is the wrong place to find that out.
    const empty = chat({ lastMessage: message({ content: null }) });
    expect(getChatPreview(empty, VIEWER)).toBe('');
  });
});

describe('getOtherMembers', () => {
  it('leaves the viewer out of their own member list', () => {
    const others = getOtherMembers(chat().members, VIEWER);
    expect(others.map((m) => m.user.id)).toEqual([PEER]);
  });

  it('returns everyone when the viewer is not a member', () => {
    expect(getOtherMembers(chat().members, 'someone-else')).toHaveLength(2);
  });

  it('does not mutate the list it is given', () => {
    const members = chat().members;
    getOtherMembers(members, VIEWER);
    expect(members).toHaveLength(2);
  });
});
