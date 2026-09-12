import * as z from 'zod';
import { ACCOUNT_STATUSES, GLOBAL_ROLES, LIMITS } from '../constants';
import { toPersianDigits } from '../format';

const MAX_RESULTS = 30;

export const userSearchSchema = z.object({
  search: z.string().trim().max(64, { error: 'عبارت جست‌وجو بیش از حد طولانی است.' }).optional(),
  limit: z.coerce
    .number({ error: 'تعداد باید یک عدد باشد.' })
    .int({ error: 'تعداد باید عدد صحیح باشد.' })
    .min(1, { error: 'تعداد باید دست‌کم ۱ باشد.' })
    .max(MAX_RESULTS, {
      error: `تعداد نمی‌تواند بیشتر از ${toPersianDigits(MAX_RESULTS)} باشد.`,
    })
    .default(MAX_RESULTS),
});

export type UserSearchInput = z.infer<typeof userSearchSchema>;
export type UserSearchQuery = z.input<typeof userSearchSchema>;

export const adminUserQuerySchema = z.object({
  status: z.enum(ACCOUNT_STATUSES).optional(),
  search: z.string().trim().max(LIMITS.search.max).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.page.max).default(LIMITS.page.default),
});

export const adminUpdateUserSchema = z
  .object({
    role: z.enum(GLOBAL_ROLES, { error: 'نقش انتخاب‌شده معتبر نیست.' }).optional(),
    status: z.enum(ACCOUNT_STATUSES, { error: 'وضعیت انتخاب‌شده معتبر نیست.' }).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.role !== undefined || input.status !== undefined || input.isActive !== undefined,
    { error: 'تغییری برای اعمال مشخص نشده است.' }
  );

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
