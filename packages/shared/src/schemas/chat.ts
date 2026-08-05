import * as z from 'zod';
import { CHAT_ROLES, LIMITS } from '../constants';
import { toPersianDigits } from '../format';
import { idSchema } from './common';

const chatTitleSchema = z
  .string({ error: 'نام گفت‌وگو را وارد کنید.' })
  .trim()
  .min(LIMITS.chatTitle.min, {
    error: `نام باید دست‌کم ${toPersianDigits(LIMITS.chatTitle.min)} نویسه باشد.`,
  })
  .max(LIMITS.chatTitle.max, {
    error: `نام نمی‌تواند بیشتر از ${toPersianDigits(LIMITS.chatTitle.max)} نویسه باشد.`,
  });

/**
 * A discriminated union rather than one object with optional fields, because
 * the three chat types genuinely take different input: a direct chat is
 * defined by the single person on the other side and has no title, while a
 * group is defined by its title and an initial member list.
 *
 * Modelling it this way means an impossible request — a DIRECT chat with a
 * title, or a group with no name — cannot typecheck on the client and cannot
 * parse on the server.
 */
export const createChatSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('DIRECT'),
    /** The other participant. The creator is added by the server. */
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

export const updateChatSchema = z.object({
  title: chatTitleSchema.optional(),
  isReadOnly: z.boolean().optional(),
});

export type CreateChatInput = z.infer<typeof createChatSchema>;
export type CreateChatPayload = z.input<typeof createChatSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateChatInput = z.infer<typeof updateChatSchema>;
