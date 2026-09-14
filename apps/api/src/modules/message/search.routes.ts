import { zValidator } from '@hono/zod-validator';
import { searchMessagesQuerySchema } from '@repo/shared';
import { Hono } from 'hono';
import { onValidationError } from '../../lib/validation';
import { requireAuth } from '../../middleware/require-auth';
import type { AppEnv } from '../../types';
import { messageService } from './message.service';

export const searchRoutes = new Hono<AppEnv>();

searchRoutes.use('*', requireAuth);

searchRoutes.get(
  '/',
  zValidator('query', searchMessagesQuerySchema, onValidationError),
  async (c) =>
    c.json({ hits: await messageService.searchMessages(c.get('user').id, c.req.valid('query')) })
);
