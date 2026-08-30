import { COOKIE_NAMES, REFRESH_COOKIE_PATH } from '@repo/shared';
import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { env } from '../env';

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

  setCookie(c, COOKIE_NAMES.refresh, tokens.refreshToken, {
    ...BASE_OPTIONS,
    path: REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL,
  });

  setCookie(c, COOKIE_NAMES.sessionHint, '1', {
    ...BASE_OPTIONS,
    path: '/',
    maxAge: env.REFRESH_TOKEN_TTL,
  });
}

export function clearAuthCookies(c: Context): void {
  deleteCookie(c, COOKIE_NAMES.access, { ...BASE_OPTIONS, path: '/' });
  deleteCookie(c, COOKIE_NAMES.refresh, { ...BASE_OPTIONS, path: REFRESH_COOKIE_PATH });
  deleteCookie(c, COOKIE_NAMES.sessionHint, { ...BASE_OPTIONS, path: '/' });
}
