import { createMiddleware } from 'hono/factory';
import { Errors } from '../lib/errors';
import type { AppEnv } from '../types';

/**
 * Global ADMIN only — not PROFESSOR, and not chat-level admin.
 *
 * Deliberately a 403 rather than the 404 `requireChatMember` uses. There is no
 * secret in the existence of an admin panel, and a signed-in professor being
 * told "not you" is more useful than being told the route does not exist.
 */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user').role !== 'ADMIN') {
    throw Errors.forbidden('این بخش تنها در دسترس مدیران سامانه است.');
  }

  await next();
});
