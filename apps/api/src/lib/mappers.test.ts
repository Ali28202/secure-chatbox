import { describe, expect, it } from 'vitest';
import {
  toChatDto,
  toChatListItemDto,
  toChatMemberDto,
  toMessageDto,
  toUserDto,
  toUserSummaryDto,
  userSelect,
  userSummarySelect,
  type ChatListRow,
  type MessageRow,
  type UserRow,
} from './mappers';

/**
 * The mappers are the last thing that runs before a row becomes JSON on the
 * wire, which makes them the last chance to stop something leaving that should
 * not. Two rules carry most of the weight and both are tested here against rows
 * that deliberately carry more than they should: `passwordHash` is never copied,
 * and a soft-deleted message never gives up its text.
 *
 * `Prisma` is imported into `mappers.ts` as a *type* only, so it is erased at
 * compile time — these run without a database or a generated client anywhere
 * near them.
 */

const CREATED = new Date('2026-08-01T08:30:00.000Z');
const LAST_SEEN = new Date('2026-08-11T09:15:00.000Z');

const userRow = (overrides: Partial<UserRow> = {}): UserRow => ({
  id: 'user-1',
  name: 'علی محلاتی',
  universityId: '40012301',
  phoneNumber: '09121110001',
  role: 'STUDENT',
  isActive: true,
  deviceId: '1a2b3c4d-0011223344556677889900aabbccddee',
  lastSeen: LAST_SEEN,
  createdAt: CREATED,
  ...overrides,
});

const messageRow = (overrides: Partial<MessageRow> = {}): MessageRow =>
  ({
    id: 'message-1',
    chatId: 'chat-1',
    content: 'سلام استاد',
    isDeleted: false,
    isPinned: false,
    replyToId: null,
    createdAt: CREATED,
    sender: {
      id: 'user-1',
      name: 'علی محلاتی',
      universityId: '40012301',
      role: 'STUDENT',
    },
    replyTo: null,
    attachments: [],
    ...overrides,
  }) as MessageRow;

const attachment = {
  id: 'attachment-1',
  fileName: 'گزارش.pdf',
  s3Bucket: 'chatbox-attachments',
  s3ObjectKey: '2026-08/0199a0c1/گزارش.pdf',
  fileType: 'application/pdf',
  fileSize: 2048,
};

describe('the select clauses', () => {
  it('never ask the database for a password hash', () => {
    // The select and the mapper are in one file precisely so this stays true:
    // a column that is never read cannot be copied by accident later.
    expect(userSummarySelect).not.toHaveProperty('passwordHash');
    expect(userSelect).not.toHaveProperty('passwordHash');
  });
});

describe('toUserSummaryDto', () => {
  it('copies only the four public fields', () => {
    expect(toUserSummaryDto(userRow())).toEqual({
      id: 'user-1',
      name: 'علی محلاتی',
      universityId: '40012301',
      role: 'STUDENT',
    });
  });

  it('drops anything extra the row happens to carry', () => {
    // The belt to the select's braces: a `select: undefined` slip somewhere
    // would hand the mapper the whole row, and it still would not travel.
    const leaky = { ...userRow(), passwordHash: '$argon2id$v=19$secret' } as UserRow;
    expect(JSON.stringify(toUserSummaryDto(leaky))).not.toContain('argon2id');
  });

  it('leaves the phone number behind', () => {
    // This is the shape embedded in every message and every member list, so a
    // phone number in it would make browsing a group chat a way to collect the
    // numbers of everyone in it.
    expect(toUserSummaryDto(userRow())).not.toHaveProperty('phoneNumber');
  });
});

describe('toUserDto', () => {
  it('renders dates as ISO strings, since JSON has no Date', () => {
    const dto = toUserDto(userRow());
    expect(dto.createdAt).toBe(CREATED.toISOString());
    expect(dto.lastSeen).toBe(LAST_SEEN.toISOString());
  });

  it('reports a user who has never signed in as null, not an epoch date', () => {
    expect(toUserDto(userRow({ lastSeen: null })).lastSeen).toBeNull();
  });

  it('carries the active flag the web client greys accounts out with', () => {
    expect(toUserDto(userRow({ isActive: false })).isActive).toBe(false);
  });

  it('still excludes the password hash', () => {
    const leaky = { ...userRow(), passwordHash: '$argon2id$v=19$secret' } as UserRow;
    expect(toUserDto(leaky)).not.toHaveProperty('passwordHash');
  });

  it('gives an account its own phone number back', () => {
    // Only ever produced for the person making the request — the difference
    // between this DTO and the summary above is the whole reason both exist.
    expect(toUserDto(userRow()).phoneNumber).toBe('09121110001');
  });

  it('reports an account that predates the phone column as null', () => {
    expect(toUserDto(userRow({ phoneNumber: null })).phoneNumber).toBeNull();
  });

  it('does not echo the device id', () => {
    // Selected on every request, because it is what a token's `did` claim is
    // checked against — but it is session bookkeeping the client already knows
    // and has no use for, so it stops at the mapper.
    expect(toUserDto(userRow())).not.toHaveProperty('deviceId');
  });
});

describe('toChatMemberDto', () => {
  const memberRow = {
    role: 'MEMBER' as const,
    isMuted: false,
    joinedAt: CREATED,
    user: { id: 'user-1', name: 'علی محلاتی', universityId: '40012301', role: 'STUDENT' as const },
  };

  it('treats a member with no watermark as having read nothing', () => {
    // Correct for the one caller with no watermarks to give: someone just added
    // to a chat has read none of it.
    expect(toChatMemberDto(memberRow).lastReadAt).toBeNull();
  });

  it('takes the watermark from its argument, not from the row', () => {
    // `lastReadAt` is an aggregate over receipts that no `select` on ChatMember
    // can reach, so it arrives separately.
    expect(toChatMemberDto(memberRow, LAST_SEEN).lastReadAt).toBe(LAST_SEEN.toISOString());
  });
});

describe('toMessageDto', () => {
  it('maps an ordinary message whole', () => {
    const dto = toMessageDto(messageRow({ attachments: [attachment] } as Partial<MessageRow>));

    expect(dto.content).toBe('سلام استاد');
    expect(dto.attachments).toHaveLength(1);
    expect(dto.sender.id).toBe('user-1');
    expect(dto.createdAt).toBe(CREATED.toISOString());
  });

  it('withholds the text of a deleted message', () => {
    // The row keeps its content so replies still resolve and so a moderation
    // decision is reversible — but the text must not travel. `isDeleted` is the
    // client's cue to draw a tombstone.
    const dto = toMessageDto(
      messageRow({ isDeleted: true, attachments: [attachment] } as Partial<MessageRow>)
    );

    expect(dto.content).toBeNull();
    expect(dto.isDeleted).toBe(true);
    expect(dto.attachments).toEqual([]);
    // The sender stays: the tombstone says who withdrew a message.
    expect(dto.sender.name).toBe('علی محلاتی');
  });

  it('applies the same rule to a quoted message', () => {
    // The easy one to miss. Deleting a message must also blank it everywhere it
    // was quoted, or the text survives in every reply to it.
    const dto = toMessageDto(
      messageRow({
        replyToId: 'message-0',
        replyTo: {
          id: 'message-0',
          content: 'متن حذف‌شده',
          isDeleted: true,
          sender: { name: 'دکتر آقایی' },
          _count: { attachments: 3 },
        },
      } as unknown as Partial<MessageRow>)
    );

    expect(dto.replyTo?.content).toBeNull();
    expect(dto.replyTo?.isDeleted).toBe(true);
    // Even the count goes: "۳ پیوست" under a tombstone describes what was there.
    expect(dto.replyTo?.attachmentCount).toBe(0);
    expect(dto.replyTo?.senderName).toBe('دکتر آقایی');
  });

  it('flattens a live quote to one line plus a count', () => {
    const dto = toMessageDto(
      messageRow({
        replyToId: 'message-0',
        replyTo: {
          id: 'message-0',
          content: 'سؤال شما را دیدم',
          isDeleted: false,
          sender: { name: 'دکتر آقایی' },
          _count: { attachments: 2 },
        },
      } as unknown as Partial<MessageRow>)
    );

    expect(dto.replyTo).toEqual({
      id: 'message-0',
      senderName: 'دکتر آقایی',
      content: 'سؤال شما را دیدم',
      isDeleted: false,
      attachmentCount: 2,
    });
  });

  it('reports no quote as null rather than omitting the key', () => {
    expect(toMessageDto(messageRow()).replyTo).toBeNull();
  });
});

describe('toChatDto', () => {
  it('reports a chat nobody has written in yet as null', () => {
    const dto = toChatDto({
      id: 'chat-1',
      type: 'CUSTOM_GROUP',
      title: 'گروه پروژه',
      isReadOnly: false,
      creatorId: 'user-1',
      lastMessageAt: null,
      createdAt: CREATED,
    });

    expect(dto.lastMessageAt).toBeNull();
    expect(dto.createdAt).toBe(CREATED.toISOString());
  });
});

describe('toChatListItemDto', () => {
  const chatRow = (messages: MessageRow[] = []): ChatListRow =>
    ({
      id: 'chat-1',
      type: 'COURSE_GROUP',
      title: 'مبانی برنامه‌نویسی',
      isReadOnly: false,
      creatorId: 'user-2',
      lastMessageAt: CREATED,
      createdAt: CREATED,
      members: [
        {
          role: 'ADMIN',
          isMuted: false,
          joinedAt: CREATED,
          user: {
            id: 'user-2',
            name: 'دکتر آقایی',
            universityId: '900101',
            role: 'PROFESSOR',
          },
        },
        {
          role: 'MEMBER',
          isMuted: false,
          joinedAt: CREATED,
          user: {
            id: 'user-1',
            name: 'علی محلاتی',
            universityId: '40012301',
            role: 'STUDENT',
          },
        },
      ],
      messages,
    }) as ChatListRow;

  it('shows the newest message as the preview line', () => {
    const dto = toChatListItemDto(chatRow([messageRow()]));
    expect(dto.lastMessage?.content).toBe('سلام استاد');
  });

  it('reports an empty chat with no preview and nothing unread', () => {
    const dto = toChatListItemDto(chatRow());
    expect(dto.lastMessage).toBeNull();
    expect(dto.unreadCount).toBe(0);
  });

  it('defaults the unread count to zero rather than undefined', () => {
    // The sidebar renders a badge on a truthy count; `undefined` would work by
    // accident until something did arithmetic with it.
    expect(toChatListItemDto(chatRow(), {}).unreadCount).toBe(0);
  });

  it('gives each member their own read watermark', () => {
    // Fetched for the whole response at once, which is why they arrive as a map
    // rather than being selected per member.
    const read = new Date('2026-08-11T10:00:00.000Z');
    const dto = toChatListItemDto(chatRow([messageRow()]), {
      unreadCount: 4,
      watermarks: new Map([['user-2', read]]),
    });

    expect(dto.unreadCount).toBe(4);
    expect(dto.members.find((m) => m.user.id === 'user-2')?.lastReadAt).toBe(read.toISOString());
    expect(dto.members.find((m) => m.user.id === 'user-1')?.lastReadAt).toBeNull();
  });

  it('still hides a deleted last message’s text in the sidebar', () => {
    const dto = toChatListItemDto(chatRow([messageRow({ isDeleted: true })]));
    expect(dto.lastMessage?.content).toBeNull();
  });
});
