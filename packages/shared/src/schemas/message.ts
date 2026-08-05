import * as z from 'zod';
import { LIMITS } from '../constants';
import { toPersianDigits } from '../format';
import { cursorPaginationSchema, idSchema } from './common';

export const sendMessageSchema = z.object({
  content: z
    .string({ error: 'متن پیام را وارد کنید.' })
    .trim()
    .min(LIMITS.messageContent.min, { error: 'پیام نمی‌تواند خالی باشد.' })
    .max(LIMITS.messageContent.max, {
      error: `پیام نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.messageContent.max)} نویسه باشد.`,
    }),
  /** Set when this message is a reply; the target must live in the same chat. */
  replyToId: idSchema.optional(),
});

export const listMessagesQuerySchema = cursorPaginationSchema;

/**
 * Read receipts are reported in bulk: the client sends the newest message it
 * has actually shown, and the server marks everything up to it. One request
 * per scroll settle instead of one per message.
 */
export const markReadSchema = z.object({
  upToMessageId: idSchema,
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
