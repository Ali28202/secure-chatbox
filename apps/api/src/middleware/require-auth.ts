import { COOKIE_NAMES } from '@repo/shared';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { clearAuthCookies } from '../lib/cookies';
import { AppError, Errors } from '../lib/errors';
import { authService } from '../modules/auth/auth.service';
import type { AppEnv } from '../types';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, COOKIE_NAMES.access);

  if (!token) {
    throw Errors.unauthorized();
  }

  try {
    const { user } = await authService.verifyToken(token);
    c.set('user', user);
  } catch (error) {
    if (!(error instanceof AppError) || error.status !== 401) {
      clearAuthCookies(c);
    }
    throw error;
  }

  await next();
});
