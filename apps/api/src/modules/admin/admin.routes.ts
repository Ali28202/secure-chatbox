import { zValidator } from '@hono/zod-validator';
import { adminUpdateUserSchema, adminUserQuerySchema } from '@repo/shared';
import { Hono } from 'hono';
import { onValidationError } from '../../lib/validation';
import { requireAdmin } from '../../middleware/require-admin';
import { requireAuth } from '../../middleware/require-auth';
import { socketGateway } from '../../socket/gateway';
import type { AppEnv } from '../../types';
import { adminService } from './admin.service';

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use('*', requireAuth, requireAdmin);

adminRoutes.get('/users', zValidator('query', adminUserQuerySchema, onValidationError), async (c) =>
  c.json(await adminService.listUsers(c.req.valid('query')))
);

adminRoutes.get('/users/pending-count', async (c) =>
  c.json({ count: await adminService.countPending() })
);

adminRoutes.patch(
  '/users/:userId',
  zValidator('json', adminUpdateUserSchema, onValidationError),
  async (c) => {
    const userId = c.req.param('userId');
    const user = await adminService.updateUser(c.get('user').id, userId, c.req.valid('json'));

    // Revoking the rows does not close a socket that is already open.
    if (user.status === 'REJECTED' || !user.isActive) {
      await socketGateway
        .disconnectUser(userId)
        .catch((error: unknown) => console.error('failed to evict a barred user', error));
    }

    return c.json(user);
  }
);
