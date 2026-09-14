import * as z from 'zod';
import { ACCOUNT_STATUSES, GLOBAL_ROLES, LIMITS } from '../constants';
import { toPersianDigits } from '../format';

const MAX_RESULTS = 30;

export const userSearchSchema = z.object({
  search: z.string().trim().max(64, { error: 'عبارت جست‌وجو خیلی طولانیه.' }).optional(),
  limit: z.coerce
    .number({ error: 'تعداد باید عدد باشه.' })
    .int({ error: 'تعداد باید عدد درست باشه.' })
    .min(1, { error: 'تعداد باید حداقل ۱ باشه.' })
    .max(MAX_RESULTS, {
      error: `تعداد نباید بیشتر از ${toPersianDigits(MAX_RESULTS)} باشه.`,
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
    role: z.enum(GLOBAL_ROLES, { error: 'این نقش درست نیست.' }).optional(),
    status: z.enum(ACCOUNT_STATUSES, { error: 'این وضعیت درست نیست.' }).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.role !== undefined || input.status !== undefined || input.isActive !== undefined,
    { error: 'چیزی برای تغییر مشخص نکردی.' }
  );

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
