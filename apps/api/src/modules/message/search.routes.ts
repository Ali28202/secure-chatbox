import { zValidator } from '@hono/zod-validator';
import { searchMessagesQuerySchema } from '@repo/shared';
import { Hono } from 'hono';
import { onValidationError } from '../../lib/validation';
import { requireAuth } from '../../middleware/require-auth';
import type { AppEnv } from '../../types';
import { messageService } from './message.service';

/**
 * Mounted at the app level rather than under `/api/chats/:chatId`, because the
 * whole point is to look across conversations. That also means it cannot lean on
 * `requireChatMember`: the membership filter lives in the query itself.
 */
export const searchRoutes = new Hono<AppEnv>();

searchRoutes.use('*', requireAuth);

searchRoutes.get(
  '/',
  zValidator('query', searchMessagesQuerySchema, onValidationError),
  async (c) =>
    c.json({ hits: await messageService.searchMessages(c.get('user').id, c.req.valid('query')) })
);
