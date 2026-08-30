import * as z from 'zod';
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
