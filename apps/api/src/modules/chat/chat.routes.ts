import { zValidator } from '@hono/zod-validator';
import {
  addMemberSchema,
  canCreateChat,
  createChatSchema,
  updateChatSchema,
  updateMemberSchema,
} from '@repo/shared';
import { Hono } from 'hono';
import { Errors } from '../../lib/errors';
import { onValidationError } from '../../lib/validation';
import { requireAuth } from '../../middleware/require-auth';
import { requireChatMember } from '../../middleware/require-chat-member';
import { messageRoutes } from '../message/message.routes';
import type { AppEnv, ChatEnv } from '../../types';
import { chatService } from './chat.service';

/**
 * Routes scoped to one chat, mounted below at `/:chatId`.
 *
 * Hono passes the mount path's parameters through to the sub-app — verified,
 * not assumed — so `requireChatMember` can read `:chatId` here and every
 * handler beneath it is guaranteed a membership on the context.
 */
const chatDetailRoutes = new Hono<ChatEnv>();

chatDetailRoutes.use('*', requireChatMember);

chatDetailRoutes.get('/', async (c) =>
  c.json(await chatService.getChat(c.get('chatId'), c.get('user').id))
);

/** Rename, or flip read-only. Admin-only, and never for a direct chat. */
chatDetailRoutes.patch('/', zValidator('json', updateChatSchema, onValidationError), async (c) =>
  c.json(await chatService.updateChat(c.get('chat'), c.get('membership'), c.req.valid('json')))
);

chatDetailRoutes.post(
  '/members',
  zValidator('json', addMemberSchema, onValidationError),
  async (c) => {
    const member = await chatService.addMember(
      c.get('chat'),
      c.get('membership'),
      c.req.valid('json')
    );
    return c.json(member, 201);
  }
);

/**
 * Promote, demote, mute, unmute — one endpoint, because from the caller's side
 * they are the same thing: editing one row of the member list.
 *
 * Handing over ADMIN through here is also the way an admin becomes able to
 * leave, which the removal route below refuses while they are the last one.
 */
chatDetailRoutes.patch(
  '/members/:userId',
  zValidator('json', updateMemberSchema, onValidationError),
  async (c) =>
    c.json(
      await chatService.updateMember(
        c.get('chat'),
        c.get('membership'),
        c.req.param('userId'),
        c.req.valid('json')
      )
    )
);

/** Removing yourself is leaving; removing anyone else is an admin action. */
chatDetailRoutes.delete('/members/:userId', async (c) => {
  await chatService.removeMember(c.get('chat'), c.get('membership'), c.req.param('userId'));
  return c.json({ success: true });
});

chatDetailRoutes.route('/messages', messageRoutes);

// ---------------------------------------------------------------------------

/** Mounted at `/api/chats`. Everything here needs a signed-in user. */
export const chatRoutes = new Hono<AppEnv>();

chatRoutes.use('*', requireAuth);

chatRoutes.get('/', async (c) => c.json(await chatService.getUserChats(c.get('user').id)));

chatRoutes.post('/', zValidator('json', createChatSchema, onValidationError), async (c) => {
  const user = c.get('user');
  const input = c.req.valid('json');

  // A course group is a teaching artifact: the use-case diagram gives it to
  // professors, and a student who could create one could also add classmates to
  // it and administer it. Custom groups and direct chats stay open to everyone.
  //
  // The same predicate decides whether the web app offers «گروه درسی» in its
  // type picker, so a student never reaches a form whose submit is refused.
  if (!canCreateChat(user, input.type)) {
    throw Errors.forbidden('ساخت گروه درسی تنها از عهدهٔ استادان برمی‌آید.');
  }

  return c.json(await chatService.createChat(user.id, input), 201);
});

chatRoutes.route('/:chatId', chatDetailRoutes);
