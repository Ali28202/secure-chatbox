import { zValidator } from '@hono/zod-validator';
import { COOKIE_NAMES, loginSchema, registerSchema } from '@repo/shared';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { clearAuthCookies, setAuthCookies } from '../../lib/cookies';
import { Errors } from '../../lib/errors';
import { toUserDto } from '../../lib/mappers';
import { onValidationError } from '../../lib/validation';
import { requireAuth } from '../../middleware/require-auth';
import type { AppEnv } from '../../types';
import { authService } from './auth.service';

/**
 * Mounted at `/api/auth`, which is also the path the refresh cookie is scoped
 * to — so the long-lived token travels only to the routes that can redeem it.
 */
export const authRoutes = new Hono<AppEnv>();

/**
 * Creates the account but does **not** sign the user in. Registration and
 * authentication stay separate: the client calls `/login` afterwards, and the
 * one endpoint that hands out sessions is the one that checks a password.
 */
authRoutes.post('/register', zValidator('json', registerSchema, onValidationError), async (c) => {
  const user = await authService.register(c.req.valid('json'));
  return c.json(user, 201);
});

authRoutes.post('/login', zValidator('json', loginSchema, onValidationError), async (c) => {
  const { user, tokens } = await authService.login(c.req.valid('json'));
  setAuthCookies(c, tokens);
  return c.json(user);
});

/**
 * The last line of defence for a session, and so the place that decides when one
 * is over. Every failure here clears all three cookies: refresh is what an
 * expired access token falls back to, so if *this* fails there is nothing left
 * to try, and leaving `session_hint` behind would leave the web client's proxy
 * admitting requests to pages that can never load a user.
 */
authRoutes.post('/refresh', async (c) => {
  const token = getCookie(c, COOKIE_NAMES.refresh);

  try {
    if (!token) {
      throw Errors.unauthorized('نشست شما به پایان رسیده است. دوباره وارد شوید.');
    }

    const { user, tokens } = await authService.refresh(token);
    setAuthCookies(c, tokens);
    return c.json(user);
  } catch (error) {
    clearAuthCookies(c);
    throw error;
  }
});

/**
 * Clearing the cookies is the whole of logout. Refresh tokens are stateless by
 * the design recorded in the plan (no `Session` table, so the submitted ERD
 * stands), which means a token already copied out of the browser stays valid
 * until it expires. The tradeoff was deliberate; the mitigation is the short
 * access-token TTL and rotation on every refresh.
 */
authRoutes.post('/logout', (c) => {
  clearAuthCookies(c);
  return c.json({ success: true });
});

/** The signed-in user. `requireAuth` has already loaded it. */
authRoutes.get('/me', requireAuth, (c) => c.json(toUserDto(c.get('user'))));
