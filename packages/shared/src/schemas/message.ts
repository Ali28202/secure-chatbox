import * as z from 'zod';
import { LIMITS, REACTION_EMOJIS } from '../constants';
import { toPersianDigits } from '../format';
import { cursorPaginationSchema, idSchema } from './common';

export const sendMessageSchema = z.object({
  content: z
    .string({ error: 'متن پیام رو بنویس.' })
    .trim()
    .min(LIMITS.messageContent.min, { error: 'پیام نمی‌تونه خالی باشه.' })
    .max(LIMITS.messageContent.max, {
      error: `پیام نباید بیشتر از ${toPersianDigits(LIMITS.messageContent.max)} کاراکتر باشه.`,
    }),
  replyToId: idSchema.optional(),
});

export const uploadMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .max(LIMITS.messageContent.max, {
      error: `پیام نباید بیشتر از ${toPersianDigits(LIMITS.messageContent.max)} کاراکتر باشه.`,
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
    .string({ error: 'چیزی که دنبالشی رو بنویس.' })
    .trim()
    .min(LIMITS.search.min, {
      error: `عبارت جست‌وجو باید حداقل ${toPersianDigits(LIMITS.search.min)} کاراکتر باشه.`,
    })
    .max(LIMITS.search.max, {
      error: `عبارت جست‌وجو نباید بیشتر از ${toPersianDigits(LIMITS.search.max)} کاراکتر باشه.`,
    }),
  limit: z.coerce
    .number({ error: 'تعداد باید عدد باشه.' })
    .int({ error: 'تعداد باید عدد درست باشه.' })
    .min(1, { error: 'تعداد باید حداقل ۱ باشه.' })
    .max(LIMITS.page.max, {
      error: `تعداد نباید بیشتر از ${toPersianDigits(LIMITS.page.max)} باشه.`,
    })
    .default(LIMITS.page.default),
});

export const toggleReactionSchema = z.object({
  emoji: z.enum(REACTION_EMOJIS, { error: 'این واکنش پشتیبانی نمی‌شه.' }),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type UploadMessageInput = z.infer<typeof uploadMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
export type PinMessageInput = z.infer<typeof pinMessageSchema>;
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>;
export type SearchMessagesQuery = z.infer<typeof searchMessagesQuerySchema>;
