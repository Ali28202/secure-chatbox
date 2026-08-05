import * as z from 'zod';
import { GLOBAL_ROLES, LIMITS } from '../constants';
import { toPersianDigits } from '../format';

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

export const loginSchema = z.object({
  universityId: universityIdSchema,
  password: passwordSchema,
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

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
/** Pre-parse shape — `role` is optional here, required in `CreateUserInput`. */
export type CreateUserPayload = z.input<typeof createUserSchema>;
