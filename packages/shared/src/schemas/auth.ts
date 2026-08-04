import * as z from 'zod';
import { GLOBAL_ROLES, LIMITS } from '../constants';

/**
 * The university-issued identifier users log in with — a student number for
 * students, a staff number for professors. Not an email: the platform is
 * closed to the campus network and has no mail delivery to verify against.
 */
const universityIdSchema = z
  .string({ error: 'شناسهٔ دانشگاهی را وارد کنید.' })
  .trim()
  .min(LIMITS.universityId.min, {
    error: `شناسهٔ دانشگاهی باید دست‌کم ${LIMITS.universityId.min} نویسه باشد.`,
  })
  .max(LIMITS.universityId.max, {
    error: `شناسهٔ دانشگاهی نمی‌تواند بیشتر از ${LIMITS.universityId.max} نویسه باشد.`,
  });

const passwordSchema = z
  .string({ error: 'گذرواژه را وارد کنید.' })
  .min(LIMITS.password.min, {
    error: `گذرواژه باید دست‌کم ${LIMITS.password.min} نویسه باشد.`,
  })
  .max(LIMITS.password.max, {
    error: `گذرواژه نمی‌تواند بیشتر از ${LIMITS.password.max} نویسه باشد.`,
  });

export const loginSchema = z.object({
  universityId: universityIdSchema,
  password: passwordSchema,
});

export const registerSchema = z.object({
  universityId: universityIdSchema,
  password: passwordSchema,
  name: z
    .string({ error: 'نام و نام خانوادگی را وارد کنید.' })
    .trim()
    .min(LIMITS.name.min, { error: `نام باید دست‌کم ${LIMITS.name.min} نویسه باشد.` })
    .max(LIMITS.name.max, { error: `نام نمی‌تواند بیشتر از ${LIMITS.name.max} نویسه باشد.` }),
  role: z.enum(GLOBAL_ROLES, { error: 'نقش انتخاب‌شده معتبر نیست.' }).default('STUDENT'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** After parsing — `role` is guaranteed present because of its default. */
export type RegisterInput = z.infer<typeof registerSchema>;

/** Before parsing — what a caller may actually send, with `role` optional. */
export type RegisterPayload = z.input<typeof registerSchema>;
