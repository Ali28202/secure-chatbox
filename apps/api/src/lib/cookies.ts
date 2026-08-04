import { COOKIE_NAMES, REFRESH_COOKIE_PATH } from '@repo/shared';
import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { env } from '../env';

/**
 * `SameSite=Lax` is enough here: ports are not part of a "site", so the web
 * client on :3000 and the API on :3001 are same-site even in development. That
 * lets us avoid `SameSite=None`, which would force `Secure`, which would break
 * a plain-HTTP intranet deployment.
 */
const BASE_OPTIONS = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'Lax',
} as const;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export function setAuthCookies(c: Context, tokens: AuthTokens): void {
  setCookie(c, COOKIE_NAMES.access, tokens.accessToken, {
    ...BASE_OPTIONS,
    path: '/',
    maxAge: env.ACCESS_TOKEN_TTL,
  });

  // Scoped to the auth routes so the long-lived token is not sent with every
  // ordinary request — it only travels where it can actually be redeemed.
  setCookie(c, COOKIE_NAMES.refresh, tokens.refreshToken, {
    ...BASE_OPTIONS,
    path: REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL,
  });
}

/**
 * Paths must match the ones used when setting, exactly. A cookie deleted at a
 * different path is silently left in place by the browser, which shows up
 * later as a logout that appears to work until the next page load.
 */
export function clearAuthCookies(c: Context): void {
  deleteCookie(c, COOKIE_NAMES.access, { ...BASE_OPTIONS, path: '/' });
  deleteCookie(c, COOKIE_NAMES.refresh, { ...BASE_OPTIONS, path: REFRESH_COOKIE_PATH });
}
