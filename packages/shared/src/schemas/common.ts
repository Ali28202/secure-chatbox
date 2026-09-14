import * as z from 'zod';
import { LIMITS } from '../constants';
import { toPersianDigits } from '../format';

export const idSchema = z.uuid({ error: 'شناسه درست نیست.' });

export const cursorPaginationSchema = z.object({
  before: idSchema.optional(),
  limit: z.coerce
    .number({ error: 'تعداد باید عدد باشه.' })
    .int({ error: 'تعداد باید عدد درست باشه.' })
    .min(1, { error: 'تعداد باید حداقل ۱ باشه.' })
    .max(LIMITS.page.max, {
      error: `تعداد نباید بیشتر از ${toPersianDigits(LIMITS.page.max)} باشه.`,
    })
    .default(LIMITS.page.default),
});

export type CursorPagination = z.infer<typeof cursorPaginationSchema>;
export type CursorPaginationInput = z.input<typeof cursorPaginationSchema>;
