import { describe, expect, it } from 'vitest';
import { addMemberSchema, createChatSchema, updateChatSchema, updateMemberSchema } from './chat';

const UUID = '0199a0c1-6d3f-7000-8000-000000000001';

describe('createChatSchema', () => {
  it('takes a single participant for a direct chat', () => {
    const result = createChatSchema.safeParse({ type: 'DIRECT', memberId: UUID });
    expect(result.success).toBe(true);
  });

  it('takes a title and an initial roster for a group', () => {
    const result = createChatSchema.safeParse({
      type: 'COURSE_GROUP',
      title: 'مبانی برنامه‌نویسی',
      memberIds: [UUID],
    });
    expect(result.success && result.data).toMatchObject({
      type: 'COURSE_GROUP',
      title: 'مبانی برنامه‌نویسی',
      memberIds: [UUID],
    });
  });

  it('starts a group with an empty roster when none is given', () => {
    // A professor may create the group first and add the class afterwards.
    const result = createChatSchema.safeParse({ type: 'CUSTOM_GROUP', title: 'گروه پروژه' });
    expect(result.success && result.data).toMatchObject({ memberIds: [] });
  });

  it('refuses a direct chat with a title', () => {
    // The point of the discriminated union: a request that mixes the two shapes
    // fails to parse on the server and fails to typecheck in the browser.
    const result = createChatSchema.safeParse({ type: 'DIRECT', title: 'گفت‌وگو' });
    expect(result.success).toBe(false);
  });

  it('refuses a group with no title', () => {
    const result = createChatSchema.safeParse({ type: 'COURSE_GROUP', memberIds: [] });
    expect(result.success).toBe(false);
  });

  it('refuses an unknown chat type', () => {
    const result = createChatSchema.safeParse({ type: 'BROADCAST', title: 'اعلانات' });
    expect(result.success).toBe(false);
  });

  it('refuses a member id that is not a uuid', () => {
    // Ids reach a `where` clause; the schema is where a non-uuid stops.
    expect(createChatSchema.safeParse({ type: 'DIRECT', memberId: 'not-a-uuid' }).success).toBe(
      false
    );
    expect(
      createChatSchema.safeParse({ type: 'CUSTOM_GROUP', title: 'گروه', memberIds: ['x'] }).success
    ).toBe(false);
  });

  it('trims the title before measuring it', () => {
    const spacesOnly = createChatSchema.safeParse({ type: 'CUSTOM_GROUP', title: '   ' });
    expect(spacesOnly.success).toBe(false);

    const padded = createChatSchema.safeParse({ type: 'CUSTOM_GROUP', title: '  گروه پروژه  ' });
    expect(padded.success && padded.data.type === 'CUSTOM_GROUP' && padded.data.title).toBe(
      'گروه پروژه'
    );
  });
});

describe('addMemberSchema', () => {
  it('adds an ordinary member by default', () => {
    const result = addMemberSchema.safeParse({ userId: UUID });
    expect(result.success && result.data.role).toBe('MEMBER');
  });

  it('accepts an explicit co-admin', () => {
    const result = addMemberSchema.safeParse({ userId: UUID, role: 'ADMIN' });
    expect(result.success && result.data.role).toBe('ADMIN');
  });
});

describe('updateChatSchema', () => {
  it('accepts either field on its own', () => {
    expect(updateChatSchema.safeParse({ title: 'نام تازه' }).success).toBe(true);
    expect(updateChatSchema.safeParse({ isReadOnly: true }).success).toBe(true);
  });

  it('rejects an empty patch', () => {
    // Without the refinement, `PATCH {}` would be a successful request that
    // changed nothing — and would still emit an update to every member.
    const result = updateChatSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('تغییری برای اعمال مشخص نشده است.');
  });

  it('rejects a non-boolean read-only flag', () => {
    expect(updateChatSchema.safeParse({ isReadOnly: 'true' }).success).toBe(false);
  });
});

describe('updateMemberSchema', () => {
  it('accepts a role change, a mute, or both', () => {
    expect(updateMemberSchema.safeParse({ role: 'ADMIN' }).success).toBe(true);
    expect(updateMemberSchema.safeParse({ isMuted: true }).success).toBe(true);
    expect(updateMemberSchema.safeParse({ role: 'MEMBER', isMuted: false }).success).toBe(true);
  });

  it('rejects an empty patch', () => {
    expect(updateMemberSchema.safeParse({}).success).toBe(false);
  });
});
