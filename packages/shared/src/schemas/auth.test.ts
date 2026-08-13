import { describe, expect, it } from 'vitest';
import { LIMITS } from '../constants';
import {
  createUserSchema,
  loginFormSchema,
  loginSchema,
  phoneNumberSchema,
  registerSchema,
} from './auth';

/** The first issue's message — what the form actually shows the user. */
const firstError = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

/** The shape `lib/device-id.ts` mints: a trait digest, a dash, 16 random bytes. */
const DEVICE_ID = '1a2b3c4d-0011223344556677889900aabbccddee';

describe('loginFormSchema', () => {
  it('accepts a university id and password', () => {
    const result = loginFormSchema.safeParse({ identifier: '40012301', password: 'Chatbox@1404' });
    expect(result.success).toBe(true);
  });

  it('accepts a phone number in the same field', () => {
    // One field, two identifiers — the server decides which column it matched.
    const result = loginFormSchema.safeParse({
      identifier: '09121110001',
      password: 'Chatbox@1404',
    });
    expect(result.success).toBe(true);
  });

  it('trims the identifier — a copied student number brings spaces with it', () => {
    const result = loginFormSchema.safeParse({
      identifier: '  40012301  ',
      password: 'Chatbox@1404',
    });
    expect(result.success && result.data.identifier).toBe('40012301');
  });

  it('does not trim the password', () => {
    // A trailing space in a passphrase is a character the user chose, and the
    // hash was computed over it. Trimming here would lock them out.
    const result = loginFormSchema.safeParse({
      identifier: '40012301',
      password: ' spaced pass ',
    });
    expect(result.success && result.data.password).toBe(' spaced pass ');
  });

  it('rejects a missing field with a Persian message', () => {
    const result = loginFormSchema.safeParse({ identifier: '40012301' });
    expect(result.success).toBe(false);
    expect(firstError(result)).toBe('گذرواژه را وارد کنید.');
  });

  it('writes the length limits in Persian numerals', () => {
    // Mixed numeral systems in one sentence read as a bug to a Persian reader,
    // so the limits go through `toPersianDigits` — «دست‌کم ۸ نویسه».
    const result = loginFormSchema.safeParse({ identifier: '40012301', password: 'short' });
    expect(firstError(result)).toContain('۸');
    expect(firstError(result)).not.toMatch(/[0-9]/);
  });

  it('enforces both ends of every limit', () => {
    const long = 'x'.repeat(LIMITS.universityId.max + 1);
    expect(loginFormSchema.safeParse({ identifier: long, password: 'Chatbox@1404' }).success).toBe(
      false
    );
    expect(loginFormSchema.safeParse({ identifier: 'ab', password: 'Chatbox@1404' }).success).toBe(
      false
    );
    expect(
      loginFormSchema.safeParse({
        identifier: '40012301',
        password: 'x'.repeat(LIMITS.password.max + 1),
      }).success
    ).toBe(false);
  });
});

describe('loginSchema', () => {
  const credentials = { identifier: '40012301', password: 'Chatbox@1404' };

  it('is the form plus the device the session binds to', () => {
    const result = loginSchema.safeParse({ ...credentials, deviceId: DEVICE_ID });
    expect(result.success && result.data.deviceId).toBe(DEVICE_ID);
  });

  it('refuses a login with no device', () => {
    // Required, not optional. A session is only valid on the device it was
    // issued to, so a token bound to nothing would fail its very next request —
    // better to reject it here than to hand out one that cannot work.
    expect(loginSchema.safeParse(credentials).success).toBe(false);
  });

  it('rejects a device id that is too short to be one', () => {
    expect(loginSchema.safeParse({ ...credentials, deviceId: 'abc123' }).success).toBe(false);
  });

  it('rejects characters a fingerprint never contains', () => {
    // The value is written straight to a column and compared against a JWT
    // claim; keeping it to an unambiguous alphabet means no encoding step can
    // ever make two different devices compare equal.
    const dirty = `${DEVICE_ID}<script>`;
    expect(loginSchema.safeParse({ ...credentials, deviceId: dirty }).success).toBe(false);
  });
});

describe('phoneNumberSchema', () => {
  it('accepts the canonical Iranian mobile form', () => {
    const result = phoneNumberSchema.safeParse('09121110001');
    expect(result.success && result.data).toBe('09121110001');
  });

  it.each([
    ['+989121110001', 'the international form'],
    ['00989121110001', 'the dialled international prefix'],
    ['9121110001', 'a leading zero left off'],
    ['0912 111 0001', 'spaces from a contacts app'],
    ['۰۹۱۲۱۱۱۰۰۰۱', 'Persian digits'],
    ['٠٩١٢١١١٠٠٠١', 'Arabic-Indic digits'],
  ])('normalises %s (%s)', (input) => {
    // All six reach the same row. Without this, one person could register twice
    // — the unique index only sees strings, and «۰۹۱۲…» is not «0912…».
    const result = phoneNumberSchema.safeParse(input);
    expect(result.success && result.data).toBe('09121110001');
  });

  it.each([
    ['0912111000', 'ten digits'],
    ['091211100011', 'twelve digits'],
    ['02112345678', 'a landline'],
    ['not-a-number', 'letters'],
  ])('rejects %s (%s)', (input) => {
    expect(phoneNumberSchema.safeParse(input).success).toBe(false);
  });

  it('explains the expected shape in Persian numerals', () => {
    expect(firstError(phoneNumberSchema.safeParse('12345'))).toContain('۰۹۱۲۳۴۵۶۷۸۹');
  });
});

describe('registerSchema', () => {
  const account = {
    universityId: '40012399',
    phoneNumber: '09121119999',
    password: 'Chatbox@1404',
    name: 'علی محلاتی',
  };

  it('accepts the four fields the signup form collects', () => {
    expect(registerSchema.safeParse(account).success).toBe(true);
  });

  it('stores the phone number canonically, whatever was typed', () => {
    const result = registerSchema.safeParse({ ...account, phoneNumber: '+98 912 111 9999' });
    expect(result.success && result.data.phoneNumber).toBe('09121119999');
  });

  it('requires a phone number', () => {
    // Nullable in the database only because accounts predate the column; every
    // account created from here on has one.
    const withoutPhone: Record<string, unknown> = { ...account };
    delete withoutPhone.phoneNumber;
    expect(registerSchema.safeParse(withoutPhone).success).toBe(false);
  });

  it('drops a role smuggled into the payload', () => {
    // The security property of this schema. Self-registration must never be a
    // way to mint a PROFESSOR — professor is the role that may create course
    // groups and delete other people's messages. `z.object` strips what it does
    // not declare, so the extra key never reaches the service.
    const result = registerSchema.safeParse({ ...account, role: 'PROFESSOR' });

    expect(result.success).toBe(true);
    expect(result.success && result.data).not.toHaveProperty('role');
  });

  it('rejects a one-word name below the floor', () => {
    expect(registerSchema.safeParse({ ...account, name: 'ع' }).success).toBe(false);
  });
});

describe('createUserSchema', () => {
  it('takes a role, unlike its sibling', () => {
    const result = createUserSchema.safeParse({
      universityId: '900102',
      phoneNumber: '09121110002',
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
      phoneNumber: '09121114000',
      password: 'Chatbox@1404',
      name: 'دانشجوی جدید',
    });
    expect(result.success && result.data.role).toBe('STUDENT');
  });

  it('rejects a role outside the enum', () => {
    const result = createUserSchema.safeParse({
      universityId: '40012400',
      phoneNumber: '09121114000',
      password: 'Chatbox@1404',
      name: 'دانشجوی جدید',
      role: 'SUPERUSER',
    });
    expect(result.success).toBe(false);
    expect(firstError(result)).toBe('نقش انتخاب‌شده معتبر نیست.');
  });
});
