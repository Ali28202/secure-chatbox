import { createMiddleware } from 'hono/factory';
import { Errors } from '../lib/errors';
import type { AppEnv } from '../types';

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user').role !== 'ADMIN') {
    throw Errors.forbidden('این بخش فقط مال مدیرهای سامانه‌ست.');
  }

  await next();
});
