import * as z from 'zod';
import { CHAT_ROLES, LIMITS } from '../constants';
import { toPersianDigits } from '../format';
import { idSchema } from './common';

const chatTitleSchema = z
  .string({ error: 'یه اسم برای گفت‌وگو بنویس.' })
  .trim()
  .min(LIMITS.chatTitle.min, {
    error: `نام باید حداقل ${toPersianDigits(LIMITS.chatTitle.min)} کاراکتر باشه.`,
  })
  .max(LIMITS.chatTitle.max, {
    error: `نام نباید بیشتر از ${toPersianDigits(LIMITS.chatTitle.max)} کاراکتر باشه.`,
  });

export const createChatSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('DIRECT'),
    memberId: idSchema,
  }),
  z.object({
    type: z.literal('COURSE_GROUP'),
    title: chatTitleSchema,
    memberIds: z.array(idSchema).default([]),
  }),
  z.object({
    type: z.literal('CUSTOM_GROUP'),
    title: chatTitleSchema,
    memberIds: z.array(idSchema).default([]),
  }),
]);

export const addMemberSchema = z.object({
  userId: idSchema,
  role: z.enum(CHAT_ROLES, { error: 'این نقش درست نیست.' }).default('MEMBER'),
});

export const updateChatSchema = z
  .object({
    title: chatTitleSchema.optional(),
    isReadOnly: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined || input.isReadOnly !== undefined || input.isArchived !== undefined,
    { error: 'چیزی برای تغییر مشخص نکردی.' }
  );

export const listChatsQuerySchema = z.object({
  archived: z.stringbool().default(false),
});

export const updateMemberSchema = z
  .object({
    role: z.enum(CHAT_ROLES, { error: 'این نقش درست نیست.' }).optional(),
    isMuted: z.boolean().optional(),
  })
  .refine((input) => input.role !== undefined || input.isMuted !== undefined, {
    error: 'چیزی برای تغییر مشخص نکردی.',
  });

export type CreateChatInput = z.infer<typeof createChatSchema>;
export type CreateChatPayload = z.input<typeof createChatSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateChatInput = z.infer<typeof updateChatSchema>;
export type ListChatsQuery = z.infer<typeof listChatsQuerySchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
