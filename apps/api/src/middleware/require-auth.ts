import { COOKIE_NAMES } from '@repo/shared';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { clearAuthCookies } from '../lib/cookies';
import { AppError, Errors } from '../lib/errors';
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

  try {
    c.set('user', await authService.verifyToken(token));
  } catch (error) {
    // A 401 means only that *this access token* is stale — the session itself
    // may be perfectly alive, and the client's refresh flow is about to prove
    // it. Clearing cookies here would destroy the refresh token before it could
    // be redeemed, turning every fifteen-minute expiry into a forced re-login.
    //
    // Anything else is the session ending for good: an account disabled by an
    // admin (403), or a user deleted since the token was minted. The browser
    // must stop believing it has a session, `session_hint` included — otherwise
    // the web client bounces between the proxy, which sees the hint and admits
    // the request, and the authenticated layout, which cannot load a user and
    // sends it back to the login page.
    if (!(error instanceof AppError) || error.status !== 401) {
      clearAuthCookies(c);
    }
    throw error;
  }

  await next();
});
