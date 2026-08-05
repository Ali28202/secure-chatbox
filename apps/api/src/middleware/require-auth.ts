import { COOKIE_NAMES } from '@repo/shared';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { Errors } from '../lib/errors';
import { authService } from '../modules/auth/auth.service';
import type { AppEnv } from '../types';

/**
 * Gate for every route that needs a signed-in user.
 *
 * Reads the access token from its httpOnly cookie, verifies it, loads the
 * account, and puts the result on the context as `user`. Anything downstream
 * can then use `c.get('user')` and be sure it is a real, active account —
 * `authService.verifyToken` rejects disabled ones.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, COOKIE_NAMES.access);

  if (!token) {
    throw Errors.unauthorized();
  }

  c.set('user', await authService.verifyToken(token));

  await next();
});
