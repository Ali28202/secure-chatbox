import * as z from 'zod';
import { LIMITS, REACTION_EMOJIS } from '../constants';
import { toPersianDigits } from '../format';
import { cursorPaginationSchema, idSchema } from './common';

export const sendMessageSchema = z.object({
  content: z
    .string({ error: 'متن پیام را وارد کنید.' })
    .trim()
    .min(LIMITS.messageContent.min, { error: 'پیام نمی‌تواند خالی باشد.' })
    .max(LIMITS.messageContent.max, {
      error: `پیام نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.messageContent.max)} کاراکتر باشد.`,
    }),
  replyToId: idSchema.optional(),
});

export const uploadMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .max(LIMITS.messageContent.max, {
      error: `پیام نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.messageContent.max)} کاراکتر باشد.`,
    })
    .optional(),
  replyToId: idSchema.optional(),
});

export const listMessagesQuerySchema = cursorPaginationSchema;

export const markReadSchema = z.object({
  upToMessageId: idSchema,
});

export const pinMessageSchema = z.object({
  isPinned: z.boolean(),
});

export const searchMessagesQuerySchema = z.object({
  q: z
    .string({ error: 'عبارت جست‌وجو را وارد کنید.' })
    .trim()
    .min(LIMITS.search.min, {
      error: `عبارت جست‌وجو باید دست‌کم ${toPersianDigits(LIMITS.search.min)} کاراکتر باشد.`,
    })
    .max(LIMITS.search.max, {
      error: `عبارت جست‌وجو نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.search.max)} کاراکتر باشد.`,
    }),
  limit: z.coerce
    .number({ error: 'تعداد باید یک عدد باشد.' })
    .int({ error: 'تعداد باید عدد صحیح باشد.' })
    .min(1, { error: 'تعداد باید دست‌کم ۱ باشد.' })
    .max(LIMITS.page.max, {
      error: `تعداد نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.page.max)} باشد.`,
    })
    .default(LIMITS.page.default),
});

export const toggleReactionSchema = z.object({
  emoji: z.enum(REACTION_EMOJIS, { error: 'این واکنش پشتیبانی نمی‌شود.' }),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type UploadMessageInput = z.infer<typeof uploadMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
export type PinMessageInput = z.infer<typeof pinMessageSchema>;
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>;
export type SearchMessagesQuery = z.infer<typeof searchMessagesQuerySchema>;
