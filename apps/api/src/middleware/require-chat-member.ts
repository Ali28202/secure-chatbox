import { createMiddleware } from 'hono/factory';
import { Errors } from '../lib/errors';
import { chatService } from '../modules/chat/chat.service';
import type { ChatEnv } from '../types';

/**
 * Gate for every route scoped to one chat.
 *
 * Resolves `:chatId` against the signed-in user's memberships and puts the
 * membership on the context, so a handler downstream never has to remember to
 * check — and gets the caller's `ChatRole` for free when it needs to decide
 * whether they may pin, delete or add someone.
 *
 * **A non-member gets 404, not 403.** 403 is a truthful answer to the wrong
 * question: it confirms the chat exists, which turns id-guessing into a
 * membership oracle — enumerate ids, and the 403s map out every private
 * conversation on the server by existence alone. From outside the chat, "not
 * yours" and "not there" should be indistinguishable, and 404 is the only
 * status that says both.
 *
 * Must run after `requireAuth`, which is what puts `user` on the context.
 */
export const requireChatMember = createMiddleware<ChatEnv>(async (c, next) => {
  const chatId = c.req.param('chatId');

  if (!chatId) {
    throw Errors.notFound('این گفت‌وگو وجود ندارد یا به آن دسترسی ندارید.');
  }

  const membership = await chatService.findMembership(chatId, c.get('user').id);

  if (!membership) {
    throw Errors.notFound('این گفت‌وگو وجود ندارد یا به آن دسترسی ندارید.');
  }

  c.set('chatId', chatId);
  c.set('membership', membership);

  await next();
});
