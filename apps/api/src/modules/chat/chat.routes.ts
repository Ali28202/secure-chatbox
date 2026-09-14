import { zValidator } from '@hono/zod-validator';
import {
  addMemberSchema,
  createChatSchema,
  listChatsQuerySchema,
  updateChatSchema,
  updateMemberSchema,
} from '@repo/shared';
import { Hono } from 'hono';
import { onValidationError } from '../../lib/validation';
import { requireAuth } from '../../middleware/require-auth';
import { requireChatMember } from '../../middleware/require-chat-member';
import { messageRoutes } from '../message/message.routes';
import type { AppEnv, ChatEnv } from '../../types';
import { chatService } from './chat.service';

const chatDetailRoutes = new Hono<ChatEnv>();

chatDetailRoutes.use('*', requireChatMember);

chatDetailRoutes.get('/', async (c) =>
  c.json(await chatService.getChat(c.get('chatId'), c.get('user')))
);

chatDetailRoutes.patch('/', zValidator('json', updateChatSchema, onValidationError), async (c) =>
  c.json(await chatService.updateChat(c.get('chat'), c.get('membership'), c.req.valid('json')))
);

chatDetailRoutes.delete('/', async (c) => {
  await chatService.deleteChat(c.get('chat'), c.get('membership'));
  return c.json({ success: true });
});

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

chatDetailRoutes.delete('/members/:userId', async (c) => {
  await chatService.removeMember(c.get('chat'), c.get('membership'), c.req.param('userId'));
  return c.json({ success: true });
});

chatDetailRoutes.route('/messages', messageRoutes);

export const chatRoutes = new Hono<AppEnv>();

chatRoutes.use('*', requireAuth);

chatRoutes.get('/', zValidator('query', listChatsQuerySchema, onValidationError), async (c) =>
  c.json(await chatService.getUserChats(c.get('user').id, c.req.valid('query')))
);

chatRoutes.post('/', zValidator('json', createChatSchema, onValidationError), async (c) =>
  c.json(await chatService.createChat(c.get('user').id, c.req.valid('json')), 201)
);

chatRoutes.route('/:chatId', chatDetailRoutes);
