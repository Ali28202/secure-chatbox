/**
 * Every path the application links to, in one place.
 *
 * `proxy.ts` and the client components both decide where to send people, and a
 * typo in one of them produces a redirect loop that is tedious to track down.
 * Naming the paths once makes that impossible.
 */
export const ROUTES = {
  home: '/',
  login: '/login',
  register: '/register',
  chats: '/chats',
  chat: (chatId: string) => `/chats/${chatId}`,
} as const;

/** Pages that never require a session. */
export const PUBLIC_ROUTES: string[] = [ROUTES.home, ROUTES.login, ROUTES.register];

/** Pages that exist only to get you a session, and are pointless once you have one. */
export const AUTH_ROUTES: string[] = [ROUTES.login, ROUTES.register];

/** Query parameter carrying where to return to after signing in. */
export const NEXT_PARAM = 'next';

/**
 * Sanitises a `?next=` value before it is used as a redirect target.
 *
 * Anything that is not a plain in-app path is discarded. Without this check,
 * `/login?next=https://evil.example` would turn our own login page into a
 * credible-looking springboard to someone else's — the classic open redirect.
 * `//host` is rejected too: browsers read it as protocol-relative, so it leaves
 * the site despite starting with a slash.
 */
export function safeRedirectTarget(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return ROUTES.chats;
  }
  return value;
}
