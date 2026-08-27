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
  isPinned: z.boolean({ error: 'پیام پین‌ باید درست یا نادرست باشد.' }),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type UploadMessageInput = z.infer<typeof uploadMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
export type PinMessageInput = z.infer<typeof pinMessageSchema>;
