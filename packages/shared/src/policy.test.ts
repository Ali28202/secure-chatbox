import { describe, expect, it } from 'vitest';
import type { ChatRole, ChatType, GlobalRole } from './constants';
import {
  canCreateChat,
  canDeleteMessage,
  canLeaveChat,
  canManageMembers,
  canMuteMember,
  canPinMessage,
  canSendMessage,
  canUpdateChat,
  canUpdateMember,
  isFaculty,
  SEND_BLOCK_MESSAGES,
  sendBlock,
  type PolicyChat,
  type PolicyMember,
  type PolicyUser,
} from './policy';

/**
 * These are the rules the whole platform's access control reduces to, and the
 * only place they are written. The API evaluates them against rows it loaded and
 * the browser evaluates them against JSON — so a mistake here is a mistake in
 * both, and it is the one file where a wrong boolean is a security bug rather
 * than a rendering bug.
 *
 * The cases below are deliberately weighted towards the combinations the
 * comments in `policy.ts` call out as load-bearing: a muted admin, an admin in a
 * direct chat, the last admin leaving. Those are the ones a later refactor is
 * most likely to get wrong, because each is a rule that looks like a special
 * case until you know why it is there.
 */

const user = (role: GlobalRole, id = 'u1'): PolicyUser => ({ id, role });

const chat = (type: ChatType, overrides: Partial<PolicyChat> = {}): PolicyChat => ({
  type,
  isReadOnly: false,
  creatorId: 'creator',
  ...overrides,
});

const member = (
  role: ChatRole,
  overrides: { id?: string; isMuted?: boolean } = {}
): PolicyMember => ({
  user: { id: overrides.id ?? 'u1' },
  role,
  isMuted: overrides.isMuted ?? false,
});

describe('isFaculty', () => {
  it('covers professors and admins, not students', () => {
    expect(isFaculty(user('PROFESSOR'))).toBe(true);
    // An administrator who could not create a course group would have to make
    // themselves a professor to fix one.
    expect(isFaculty(user('ADMIN'))).toBe(true);
    expect(isFaculty(user('STUDENT'))).toBe(false);
  });
});

describe('canCreateChat', () => {
  it('restricts course groups to faculty', () => {
    expect(canCreateChat(user('PROFESSOR'), 'COURSE_GROUP')).toBe(true);
    expect(canCreateChat(user('ADMIN'), 'COURSE_GROUP')).toBe(true);
    expect(canCreateChat(user('STUDENT'), 'COURSE_GROUP')).toBe(false);
  });

  it('lets anyone start a direct chat or a study group', () => {
    for (const role of ['STUDENT', 'PROFESSOR', 'ADMIN'] as const) {
      expect(canCreateChat(user(role), 'DIRECT')).toBe(true);
      expect(canCreateChat(user(role), 'CUSTOM_GROUP')).toBe(true);
    }
  });
});

describe('sendBlock', () => {
  it('lets an ordinary member write in an ordinary chat', () => {
    expect(sendBlock(chat('COURSE_GROUP'), member('MEMBER'))).toBeNull();
    expect(canSendMessage(chat('COURSE_GROUP'), member('MEMBER'))).toBe(true);
  });

  it('blocks a muted member', () => {
    expect(sendBlock(chat('COURSE_GROUP'), member('MEMBER', { isMuted: true }))).toBe('MUTED');
  });

  it('blocks a muted ADMIN — muting is checked before the role', () => {
    // The order in `sendBlock` is the rule: if `isReadOnly` were read first, an
    // admin could never be muted at all, which is exactly the person `isMuted`
    // most needs to work against.
    expect(sendBlock(chat('COURSE_GROUP'), member('ADMIN', { isMuted: true }))).toBe('MUTED');
  });

  it('makes a read-only chat an announcement channel', () => {
    const readOnly = chat('COURSE_GROUP', { isReadOnly: true });

    expect(sendBlock(readOnly, member('MEMBER'))).toBe('READ_ONLY');
    expect(sendBlock(readOnly, member('ADMIN'))).toBeNull();
  });

  it('reports MUTED rather than READ_ONLY when both apply', () => {
    const readOnly = chat('COURSE_GROUP', { isReadOnly: true });
    expect(sendBlock(readOnly, member('MEMBER', { isMuted: true }))).toBe('MUTED');
  });

  it('has a Persian sentence for every reason it can return', () => {
    // The API puts these in a 403 body and the composer puts them under the
    // disabled box; a missing entry would render `undefined` in one of them.
    for (const reason of ['MUTED', 'READ_ONLY'] as const) {
      expect(SEND_BLOCK_MESSAGES[reason]).toMatch(/\S/);
    }
  });
});

describe('canDeleteMessage', () => {
  it('lets anyone withdraw their own message', () => {
    expect(canDeleteMessage(member('MEMBER', { id: 'me' }), 'me')).toBe(true);
  });

  it('lets a chat admin delete anyone else’s', () => {
    expect(canDeleteMessage(member('ADMIN', { id: 'me' }), 'someone-else')).toBe(true);
  });

  it('refuses an ordinary member acting on someone else’s message', () => {
    expect(canDeleteMessage(member('MEMBER', { id: 'me' }), 'someone-else')).toBe(false);
  });
});

describe('canPinMessage', () => {
  it('is admin-only, with no "your own message" exception', () => {
    expect(canPinMessage(member('ADMIN'))).toBe(true);
    // Unlike deletion: pinning changes what the whole chat sees at the top.
    expect(canPinMessage(member('MEMBER'))).toBe(false);
  });
});

describe('administering a chat', () => {
  it('excludes direct chats even from an ADMIN', () => {
    // Both participants of a direct chat are ADMIN — there is no hierarchy in a
    // conversation between two people — so a role-only rule would let either of
    // them mute the other.
    const direct = chat('DIRECT');

    expect(canUpdateChat(direct, member('ADMIN'))).toBe(false);
    expect(canManageMembers(direct, member('ADMIN'))).toBe(false);
    expect(
      canUpdateMember(direct, member('ADMIN', { id: 'a' }), member('ADMIN', { id: 'b' }))
    ).toBe(false);
  });

  it('lets a group admin edit the chat and its members', () => {
    for (const type of ['COURSE_GROUP', 'CUSTOM_GROUP'] as const) {
      expect(canUpdateChat(chat(type), member('ADMIN'))).toBe(true);
      expect(canManageMembers(chat(type), member('ADMIN'))).toBe(true);
      expect(canUpdateChat(chat(type), member('MEMBER'))).toBe(false);
      expect(canManageMembers(chat(type), member('MEMBER'))).toBe(false);
    }
  });

  it('never lets an admin act on themselves', () => {
    // Load-bearing: a self-demotion could leave a group with no admin at all,
    // which nothing inside the app could then repair.
    const group = chat('COURSE_GROUP');
    const self = member('ADMIN', { id: 'me' });

    expect(canUpdateMember(group, self, member('ADMIN', { id: 'me' }))).toBe(false);
    expect(canMuteMember(group, self, member('ADMIN', { id: 'me' }))).toBe(false);
  });
});

describe('canMuteMember', () => {
  const group = chat('COURSE_GROUP');
  const actor = member('ADMIN', { id: 'actor' });

  it('mutes an ordinary member', () => {
    expect(canMuteMember(group, actor, member('MEMBER', { id: 'target' }))).toBe(true);
  });

  it('refuses to mute a co-admin', () => {
    // Co-admins can remove each other; they cannot gag each other. In a
    // read-only chat, muting the admins would silence the only people who can
    // speak in it.
    expect(canMuteMember(group, actor, member('ADMIN', { id: 'target' }))).toBe(false);
  });

  it('refuses when the actor is not an admin', () => {
    const ordinary = member('MEMBER', { id: 'actor' });
    expect(canMuteMember(group, ordinary, member('MEMBER', { id: 'target' }))).toBe(false);
  });
});

describe('canLeaveChat', () => {
  const group = chat('CUSTOM_GROUP');

  it('lets an ordinary member walk out', () => {
    expect(canLeaveChat(group, member('MEMBER'), 0)).toBe(true);
  });

  it('holds the last admin until they appoint a successor', () => {
    expect(canLeaveChat(group, member('ADMIN'), 0)).toBe(false);
    expect(canLeaveChat(group, member('ADMIN'), 1)).toBe(true);
  });

  it('refuses to halve a direct chat', () => {
    // A one-person "conversation" is a row nothing in the UI knows how to draw;
    // a direct chat is left by deleting it.
    expect(canLeaveChat(chat('DIRECT'), member('ADMIN'), 1)).toBe(false);
    expect(canLeaveChat(chat('DIRECT'), member('MEMBER'), 5)).toBe(false);
  });
});
