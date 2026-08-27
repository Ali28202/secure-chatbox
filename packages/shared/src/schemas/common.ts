import * as z from 'zod';
import { LIMITS } from '../constants';
import { toPersianDigits } from '../format';

export const idSchema = z.uuid({ error: 'شناسه معتبر نیست.' });

export const cursorPaginationSchema = z.object({
  before: idSchema.optional(),
  limit: z.coerce
    .number({ error: 'تعداد باید یک عدد باشد.' })
    .int({ error: 'تعداد باید عدد صحیح باشد.' })
    .min(1, { error: 'تعداد باید دست‌کم ۱ باشد.' })
    .max(LIMITS.page.max, {
      error: `تعداد نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.page.max)} باشد.`,
    })
    .default(LIMITS.page.default),
});

export type CursorPagination = z.infer<typeof cursorPaginationSchema>;
export type CursorPaginationInput = z.input<typeof cursorPaginationSchema>;
