import { createMiddleware } from 'hono/factory';
import { Errors } from '../lib/errors';
import { chatService } from '../modules/chat/chat.service';
import type { ChatEnv } from '../types';

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
  c.set('membership', membership.member);
  c.set('chat', membership.chat);

  await next();
});
