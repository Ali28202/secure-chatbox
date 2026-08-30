import { zValidator } from '@hono/zod-validator';
import { userSearchSchema } from '@repo/shared';
import { Hono } from 'hono';
import { onValidationError } from '../../lib/validation';
import { requireAuth } from '../../middleware/require-auth';
import type { AppEnv } from '../../types';
import { userService } from './user.service';

export const userRoutes = new Hono<AppEnv>();

userRoutes.use('*', requireAuth);

userRoutes.get('/', zValidator('query', userSearchSchema, onValidationError), async (c) =>
  c.json(await userService.search(c.get('user').id, c.req.valid('query')))
);
