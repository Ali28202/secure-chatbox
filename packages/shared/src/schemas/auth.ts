import * as z from 'zod';
import { GLOBAL_ROLES, LIMITS } from '../constants';
import { normalizePhoneNumber, toPersianDigits } from '../format';

/**
 * The university-issued identifier users log in with — the student number for
 * students, the staff number for professors. Not an email: the platform is a
 * closed campus network with no mail delivery to verify against.
 */
export const universityIdSchema = z
  .string({ error: 'شناسهٔ دانشگاهی را وارد کنید.' })
  .trim()
  .min(LIMITS.universityId.min, {
    error: `شناسهٔ دانشگاهی باید دست‌کم ${toPersianDigits(LIMITS.universityId.min)} نویسه باشد.`,
  })
  .max(LIMITS.universityId.max, {
    error: `شناسهٔ دانشگاهی نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.universityId.max)} نویسه باشد.`,
  });

/**
 * The mobile number, normalized before it is judged.
 *
 * Normalizing inside the schema rather than in the form means every entry point
 * agrees: the API stores `09121234567` whether the browser sent `+۹۸ ۹۱۲ ۱۲۳
 * ۴۵۶۷`, `0912-123-4567`, or the canonical form. The column is unique, so two
 * spellings of one number reaching the database as two rows would be a bug that
 * only shows up as a login that mysteriously stops working.
 */
export const phoneNumberSchema = z
  .string({ error: 'شمارهٔ تلفن همراه را وارد کنید.' })
  .transform(normalizePhoneNumber)
  .refine((value) => /^09\d{9}$/.test(value), {
    error: 'شمارهٔ تلفن همراه باید ۱۱ رقم و به شکل ۰۹۱۲۳۴۵۶۷۸۹ باشد.',
  });

/**
 * What the login form asks for: a university id **or** a phone number.
 *
 * One field rather than two, because a person logging in knows which of their
 * own identifiers they are typing and does not want to tell the form which one
 * it is. The bounds are the loosest of the two so neither is rejected here —
 * deciding which identifier this is belongs to the service, which is the only
 * place that can look either of them up.
 */
export const identifierSchema = z
  .string({ error: 'شناسهٔ دانشگاهی یا شمارهٔ تلفن را وارد کنید.' })
  .trim()
  .min(LIMITS.universityId.min, {
    error: `شناسه باید دست‌کم ${toPersianDigits(LIMITS.universityId.min)} نویسه باشد.`,
  })
  .max(LIMITS.universityId.max, {
    error: `شناسه نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.universityId.max)} نویسه باشد.`,
  });

/**
 * The browser's own name for itself — see `apps/web/lib/device-id.ts`.
 *
 * Opaque to the server, which never interprets it and only ever compares it for
 * equality. The charset is restricted anyway: it is written to a column and
 * echoed in no HTML, but a value that arrives from a client and is stored is one
 * worth constraining while it costs a single regular expression.
 */
export const deviceIdSchema = z
  .string({ error: 'شناسهٔ دستگاه ارسال نشده است.' })
  .trim()
  .min(LIMITS.deviceId.min, { error: 'شناسهٔ دستگاه معتبر نیست.' })
  .max(LIMITS.deviceId.max, { error: 'شناسهٔ دستگاه معتبر نیست.' })
  .regex(/^[A-Za-z0-9_-]+$/, { error: 'شناسهٔ دستگاه معتبر نیست.' });

export const passwordSchema = z
  .string({ error: 'گذرواژه را وارد کنید.' })
  .min(LIMITS.password.min, {
    error: `گذرواژه باید دست‌کم ${toPersianDigits(LIMITS.password.min)} نویسه باشد.`,
  })
  .max(LIMITS.password.max, {
    error: `گذرواژه نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.password.max)} نویسه باشد.`,
  });

export const nameSchema = z
  .string({ error: 'نام و نام خانوادگی را وارد کنید.' })
  .trim()
  .min(LIMITS.name.min, {
    error: `نام باید دست‌کم ${toPersianDigits(LIMITS.name.min)} نویسه باشد.`,
  })
  .max(LIMITS.name.max, {
    error: `نام نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.name.max)} نویسه باشد.`,
  });

/** The two fields a person actually types. */
export const loginFormSchema = z.object({
  identifier: identifierSchema,
  password: passwordSchema,
});

/**
 * The login request, which carries one thing the form does not: the device.
 *
 * Split from `loginFormSchema` because `deviceId` is not a question anybody is
 * asked — the browser computes it and the client attaches it. Keeping it out of
 * the form's own schema is what stops it appearing as a third input, or as a
 * validation error on a field that is not on screen.
 *
 * It is required, not optional. A session is only valid on the device it was
 * issued to, so a login with no device to bind to would produce a token that
 * fails on its very next request.
 */
export const loginSchema = loginFormSchema.extend({
  deviceId: deviceIdSchema,
});

/**
 * Public self-registration.
 *
 * There is deliberately **no `role` field**. If the client could send one, the
 * signup form would be a way to mint a PROFESSOR account — and professor is
 * exactly the role that may create course groups and delete other people's
 * messages. Everyone who registers themselves is a STUDENT; professor and
 * admin accounts come from the seed or, later, from an admin creating them.
 */
export const registerSchema = z.object({
  universityId: universityIdSchema,
  phoneNumber: phoneNumberSchema,
  password: passwordSchema,
  name: nameSchema,
});

/**
 * Admin-only user creation — the same fields plus the role. Kept here next to
 * its sibling so the difference between the two is visible in one screen; the
 * route that uses it arrives with the rest of user management (M11).
 */
export const createUserSchema = registerSchema.extend({
  role: z.enum(GLOBAL_ROLES, { error: 'نقش انتخاب‌شده معتبر نیست.' }).default('STUDENT'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
/** Pre-transform shape — what the register form binds its inputs to. */
export type RegisterFormValues = z.input<typeof registerSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
/** Pre-parse shape — `role` is optional here, required in `CreateUserInput`. */
export type CreateUserPayload = z.input<typeof createUserSchema>;
