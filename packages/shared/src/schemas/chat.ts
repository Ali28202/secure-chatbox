import * as z from 'zod';
import { CHAT_ROLES, LIMITS } from '../constants';
import { toPersianDigits } from '../format';
import { idSchema } from './common';

const chatTitleSchema = z
  .string({ error: 'نام گفت‌وگو را وارد کنید.' })
  .trim()
  .min(LIMITS.chatTitle.min, {
    error: `نام باید دست‌کم ${toPersianDigits(LIMITS.chatTitle.min)} کاراکتر باشد.`,
  })
  .max(LIMITS.chatTitle.max, {
    error: `نام نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.chatTitle.max)} کاراکتر باشد.`,
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
  role: z.enum(CHAT_ROLES, { error: 'نقش انتخاب‌شده معتبر نیست.' }).default('MEMBER'),
});

export const updateChatSchema = z
  .object({
    title: chatTitleSchema.optional(),
    isReadOnly: z.boolean({ error: 'مقدار فقط‌خواندنی باید درست یا نادرست باشد.' }).optional(),
  })
  .refine((input) => input.title !== undefined || input.isReadOnly !== undefined, {
    error: 'تغییری برای اعمال مشخص نشده است.',
  });

export const updateMemberSchema = z
  .object({
    role: z.enum(CHAT_ROLES, { error: 'نقش انتخاب‌شده معتبر نیست.' }).optional(),
    isMuted: z.boolean({ error: 'مقدار بی‌صدا باید درست یا نادرست باشد.' }).optional(),
  })
  .refine((input) => input.role !== undefined || input.isMuted !== undefined, {
    error: 'تغییری برای اعمال مشخص نشده است.',
  });

export type CreateChatInput = z.infer<typeof createChatSchema>;
export type CreateChatPayload = z.input<typeof createChatSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateChatInput = z.infer<typeof updateChatSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
