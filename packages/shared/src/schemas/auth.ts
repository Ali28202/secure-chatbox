import * as z from 'zod';
import { GLOBAL_ROLES, LIMITS } from '../constants';
import { normalizePhoneNumber, toPersianDigits } from '../format';

export const universityIdSchema = z
  .string({ error: 'شماره دانشجوییت رو بنویس.' })
  .trim()
  .min(LIMITS.universityId.min, {
    error: `شماره دانشجویی باید حداقل ${toPersianDigits(LIMITS.universityId.min)} کاراکتر باشه.`,
  })
  .max(LIMITS.universityId.max, {
    error: `شماره دانشجویی نباید بیشتر از ${toPersianDigits(LIMITS.universityId.max)} کاراکتر باشه.`,
  });

export const phoneNumberSchema = z
  .string({ error: 'شمارهٔ موبایلت رو بنویس.' })
  .transform(normalizePhoneNumber)
  .refine((value) => /^09\d{9}$/.test(value), {
    error: 'شمارهٔ موبایل باید ۱۱ رقم باشه، مثل ۰۹۱۲۳۴۵۶۷۸۹.',
  });

export const identifierSchema = z
  .string({ error: 'شماره دانشجویی یا شمارهٔ تلفنت رو بنویس.' })
  .trim()
  .min(LIMITS.universityId.min, {
    error: `شماره باید حداقل ${toPersianDigits(LIMITS.universityId.min)} کاراکتر باشه.`,
  })
  .max(LIMITS.universityId.max, {
    error: `شماره نباید بیشتر از ${toPersianDigits(LIMITS.universityId.max)} کاراکتر باشه.`,
  });

export const deviceIdSchema = z
  .string({ error: 'شناسهٔ دستگاه فرستاده نشده.' })
  .trim()
  .min(LIMITS.deviceId.min, { error: 'شناسهٔ دستگاه درست نیست.' })
  .max(LIMITS.deviceId.max, { error: 'شناسهٔ دستگاه درست نیست.' })
  .regex(/^[A-Za-z0-9_-]+$/, { error: 'شناسهٔ دستگاه درست نیست.' });

export const passwordSchema = z
  .string({ error: 'گذرواژه‌ات رو بنویس.' })
  .min(LIMITS.password.min, {
    error: `گذرواژه باید حداقل ${toPersianDigits(LIMITS.password.min)} کاراکتر باشه.`,
  })
  .max(LIMITS.password.max, {
    error: `گذرواژه نباید بیشتر از ${toPersianDigits(LIMITS.password.max)} کاراکتر باشه.`,
  });

export const nameSchema = z
  .string({ error: 'اسم و فامیلت رو بنویس.' })
  .trim()
  .min(LIMITS.name.min, {
    error: `نام باید حداقل ${toPersianDigits(LIMITS.name.min)} کاراکتر باشه.`,
  })
  .max(LIMITS.name.max, {
    error: `نام نباید بیشتر از ${toPersianDigits(LIMITS.name.max)} کاراکتر باشه.`,
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
  role: z.enum(GLOBAL_ROLES, { error: 'این نقش درست نیست.' }).default('STUDENT'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RegisterFormValues = z.input<typeof registerSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type CreateUserPayload = z.input<typeof createUserSchema>;
