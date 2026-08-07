import { zValidator } from '@hono/zod-validator';
import { listMessagesQuerySchema, markReadSchema, sendMessageSchema } from '@repo/shared';
import { Hono } from 'hono';
import { onValidationError } from '../../lib/validation';
import type { ChatEnv } from '../../types';
import { messageService } from './message.service';

/**
 * Mounted at `/api/chats/:chatId/messages`, below `requireChatMember`.
 *
 * There is no route here that takes a chat id: the only chat these handlers can
 * reach is the one the guard above them has already admitted the caller to. A
 * message endpoint that accepted its own `chatId` would be a second door into
 * the same room, and it would be the one nobody remembers to lock.
 */
export const messageRoutes = new Hono<ChatEnv>();

messageRoutes.get('/', zValidator('query', listMessagesQuerySchema, onValidationError), async (c) =>
  c.json(await messageService.getMessages(c.get('chatId'), c.req.valid('query')))
);

messageRoutes.post('/', zValidator('json', sendMessageSchema, onValidationError), async (c) => {
  const message = await messageService.sendMessage(
    c.get('chat'),
    c.get('membership'),
    c.req.valid('json')
  );

  return c.json(message, 201);
});

/**
 * Declared before `/:messageId` would matter if they shared a method — they do
 * not, so this is only about reading order. `read` is a verb on the collection,
 * not a message id, and the schema is what stops one being mistaken for the
 * other: the id travels in the body.
 */
messageRoutes.post('/read', zValidator('json', markReadSchema, onValidationError), async (c) =>
  c.json(await messageService.markAsRead(c.get('chat'), c.get('membership'), c.req.valid('json')))
);

/**
 * Soft delete. Answers with the tombstoned message rather than `204`, so the
 * client can replace the row it already has instead of refetching the page to
 * find out what changed.
 */
messageRoutes.delete('/:messageId', async (c) =>
  c.json(
    await messageService.softDeleteMessage(
      c.get('chat'),
      c.get('membership'),
      c.req.param('messageId')
    )
  )
);
