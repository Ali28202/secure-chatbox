import { describe, expect, it } from 'vitest';
import { LIMITS } from '../constants';
import { createUserSchema, loginSchema, registerSchema } from './auth';

/** The first issue's message — what the form actually shows the user. */
const firstError = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe('loginSchema', () => {
  it('accepts a university id and password', () => {
    const result = loginSchema.safeParse({ universityId: '40012301', password: 'Chatbox@1404' });
    expect(result.success).toBe(true);
  });

  it('trims the university id — a copied student number brings spaces with it', () => {
    const result = loginSchema.safeParse({
      universityId: '  40012301  ',
      password: 'Chatbox@1404',
    });
    expect(result.success && result.data.universityId).toBe('40012301');
  });

  it('does not trim the password', () => {
    // A trailing space in a passphrase is a character the user chose, and the
    // hash was computed over it. Trimming here would lock them out.
    const result = loginSchema.safeParse({ universityId: '40012301', password: ' spaced pass ' });
    expect(result.success && result.data.password).toBe(' spaced pass ');
  });

  it('rejects a missing field with a Persian message', () => {
    const result = loginSchema.safeParse({ universityId: '40012301' });
    expect(result.success).toBe(false);
    expect(firstError(result)).toBe('گذرواژه را وارد کنید.');
  });

  it('writes the length limits in Persian numerals', () => {
    // Mixed numeral systems in one sentence read as a bug to a Persian reader,
    // so the limits go through `toPersianDigits` — «دست‌کم ۸ نویسه».
    const result = loginSchema.safeParse({ universityId: '40012301', password: 'short' });
    expect(firstError(result)).toContain('۸');
    expect(firstError(result)).not.toMatch(/[0-9]/);
  });

  it('enforces both ends of every limit', () => {
    const long = 'x'.repeat(LIMITS.universityId.max + 1);
    expect(loginSchema.safeParse({ universityId: long, password: 'Chatbox@1404' }).success).toBe(
      false
    );
    expect(loginSchema.safeParse({ universityId: 'ab', password: 'Chatbox@1404' }).success).toBe(
      false
    );
    expect(
      loginSchema.safeParse({
        universityId: '40012301',
        password: 'x'.repeat(LIMITS.password.max + 1),
      }).success
    ).toBe(false);
  });
});

describe('registerSchema', () => {
  it('accepts the three fields the signup form collects', () => {
    const result = registerSchema.safeParse({
      universityId: '40012399',
      password: 'Chatbox@1404',
      name: 'علی محلاتی',
    });
    expect(result.success).toBe(true);
  });

  it('drops a role smuggled into the payload', () => {
    // The security property of this schema. Self-registration must never be a
    // way to mint a PROFESSOR — professor is the role that may create course
    // groups and delete other people's messages. `z.object` strips what it does
    // not declare, so the extra key never reaches the service.
    const result = registerSchema.safeParse({
      universityId: '40012399',
      password: 'Chatbox@1404',
      name: 'علی محلاتی',
      role: 'PROFESSOR',
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data).not.toHaveProperty('role');
  });

  it('rejects a one-word name below the floor', () => {
    const result = registerSchema.safeParse({
      universityId: '40012399',
      password: 'Chatbox@1404',
      name: 'ع',
    });
    expect(result.success).toBe(false);
  });
});

describe('createUserSchema', () => {
  it('takes a role, unlike its sibling', () => {
    const result = createUserSchema.safeParse({
      universityId: '900102',
      password: 'Chatbox@1404',
      name: 'دکتر مجید آقایی',
      role: 'PROFESSOR',
    });
    expect(result.success && result.data.role).toBe('PROFESSOR');
  });

  it('defaults to STUDENT when the admin leaves it out', () => {
    // The safe default: forgetting the field creates the least privileged user.
    const result = createUserSchema.safeParse({
      universityId: '40012400',
      password: 'Chatbox@1404',
      name: 'دانشجوی جدید',
    });
    expect(result.success && result.data.role).toBe('STUDENT');
  });

  it('rejects a role outside the enum', () => {
    const result = createUserSchema.safeParse({
      universityId: '40012400',
      password: 'Chatbox@1404',
      name: 'دانشجوی جدید',
      role: 'SUPERUSER',
    });
    expect(result.success).toBe(false);
    expect(firstError(result)).toBe('نقش انتخاب‌شده معتبر نیست.');
  });
});
