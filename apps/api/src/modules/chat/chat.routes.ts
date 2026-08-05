import { zValidator } from '@hono/zod-validator';
import { addMemberSchema, createChatSchema } from '@repo/shared';
import { Hono } from 'hono';
import { Errors } from '../../lib/errors';
import { onValidationError } from '../../lib/validation';
import { requireAuth } from '../../middleware/require-auth';
import { requireChatMember } from '../../middleware/require-chat-member';
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

chatDetailRoutes.post(
  '/members',
  zValidator('json', addMemberSchema, onValidationError),
  async (c) => {
    const member = await chatService.addMember(
      c.get('chatId'),
      c.get('membership'),
      c.req.valid('json')
    );
    return c.json(member, 201);
  }
);

/** Removing yourself is leaving; removing anyone else is an admin action. */
chatDetailRoutes.delete('/members/:userId', async (c) => {
  await chatService.removeMember(c.get('chatId'), c.get('membership'), c.req.param('userId'));
  return c.json({ success: true });
});

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
  // This predicate moves into M11's `policy.ts` alongside the rest of the role
  // rules — it lives here now because shipping the endpoint without it would
  // mean shipping the hole and remembering to close it later.
  if (input.type === 'COURSE_GROUP' && user.role === 'STUDENT') {
    throw Errors.forbidden('ساخت گروه درسی تنها از عهدهٔ استادان برمی‌آید.');
  }

  return c.json(await chatService.createChat(user.id, input), 201);
});

chatRoutes.route('/:chatId', chatDetailRoutes);
