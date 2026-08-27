import * as z from 'zod';
import { GLOBAL_ROLES, LIMITS } from '../constants';
import { normalizePhoneNumber, toPersianDigits } from '../format';

export const universityIdSchema = z
  .string({ error: 'شماره دانشجویی خود را وارد کنید.' })
  .trim()
  .min(LIMITS.universityId.min, {
    error: `شماره دانشجویی باید دست‌کم ${toPersianDigits(LIMITS.universityId.min)} کاراکتر باشد.`,
  })
  .max(LIMITS.universityId.max, {
    error: `شماره دانشجویی نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.universityId.max)} کاراکتر باشد.`,
  });

export const phoneNumberSchema = z
  .string({ error: 'شمارهٔ تلفن همراه خود را وارد کنید.' })
  .transform(normalizePhoneNumber)
  .refine((value) => /^09\d{9}$/.test(value), {
    error: 'شمارهٔ تلفن همراه باید ۱۱ رقم و به شکل ۰۹۱۲۳۴۵۶۷۸۹ باشد.',
  });

export const identifierSchema = z
  .string({ error: 'شماره دانشجویی یا شمارهٔ تلفن را وارد کنید.' })
  .trim()
  .min(LIMITS.universityId.min, {
    error: `شماره باید دست‌کم ${toPersianDigits(LIMITS.universityId.min)} کاراکتر باشد.`,
  })
  .max(LIMITS.universityId.max, {
    error: `شماره نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.universityId.max)} کاراکتر باشد.`,
  });

export const deviceIdSchema = z
  .string({ error: 'شناسهٔ دستگاه ارسال نشده است.' })
  .trim()
  .min(LIMITS.deviceId.min, { error: 'شناسهٔ دستگاه معتبر نیست.' })
  .max(LIMITS.deviceId.max, { error: 'شناسهٔ دستگاه معتبر نیست.' })
  .regex(/^[A-Za-z0-9_-]+$/, { error: 'شناسهٔ دستگاه معتبر نیست.' });

export const passwordSchema = z
  .string({ error: 'گذرواژه را وارد کنید.' })
  .min(LIMITS.password.min, {
    error: `گذرواژه باید دست‌کم ${toPersianDigits(LIMITS.password.min)} کاراکتر باشد.`,
  })
  .max(LIMITS.password.max, {
    error: `گذرواژه نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.password.max)} کاراکتر باشد.`,
  });

export const nameSchema = z
  .string({ error: 'نام و نام خانوادگی را وارد کنید.' })
  .trim()
  .min(LIMITS.name.min, {
    error: `نام باید دست‌کم ${toPersianDigits(LIMITS.name.min)} کاراکتر باشد.`,
  })
  .max(LIMITS.name.max, {
    error: `نام نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.name.max)} کاراکتر باشد.`,
  });

export const loginFormSchema = z.object({
  identifier: identifierSchema,
  password: passwordSchema,
});

export const loginSchema = loginFormSchema.extend({
  deviceId: deviceIdSchema,
});

export const registerSchema = z.object({
  universityId: universityIdSchema,
  phoneNumber: phoneNumberSchema,
  password: passwordSchema,
  name: nameSchema,
});

export const createUserSchema = registerSchema.extend({
  role: z.enum(GLOBAL_ROLES, { error: 'نقش انتخاب‌شده معتبر نیست.' }).default('STUDENT'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RegisterFormValues = z.input<typeof registerSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateUserPayload = z.input<typeof createUserSchema>;
