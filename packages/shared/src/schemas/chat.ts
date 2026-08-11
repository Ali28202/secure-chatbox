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

/**
 * A partial update, hence every field optional — but not *all* of them absent.
 *
 * The refinement is what stops `PATCH {}` from being a request the server
 * answers `200` to after doing nothing: a client that sent the wrong field name
 * would otherwise get a success and a screen that never changes, which is the
 * hardest kind of bug to see.
 */
export const updateChatSchema = z
  .object({
    title: chatTitleSchema.optional(),
    isReadOnly: z.boolean({ error: 'مقدار فقط‌خواندنی باید درست یا نادرست باشد.' }).optional(),
  })
  .refine((input) => input.title !== undefined || input.isReadOnly !== undefined, {
    error: 'تغییری برای اعمال مشخص نشده است.',
  });

/**
 * What an admin may change about someone else's membership: the role they hold
 * in this chat, and whether they are muted in it.
 *
 * Both are here rather than on two endpoints because they are the same
 * operation from the caller's side — editing one row of the member list — and
 * because handing the ADMIN role over is the step that lets the last admin
 * leave, which the removal route refuses until someone else can take over.
 */
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
