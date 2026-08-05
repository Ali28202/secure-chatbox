import * as z from 'zod';
import { LIMITS } from '../constants';
import { toPersianDigits } from '../format';

/** Every primary key in the schema is a UUIDv7. */
export const idSchema = z.uuid({ error: 'شناسه معتبر نیست.' });

/**
 * Cursor pagination, used for message history and any other list that grows
 * while the user is reading it. Offset pagination would skip or repeat rows
 * whenever something is inserted mid-scroll, which in a chat app is constant.
 *
 * `before` is the id of the oldest row already on screen; the server returns
 * the page immediately older than it.
 */
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
