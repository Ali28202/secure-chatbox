import { COOKIE_NAMES } from '@repo/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_ROUTES, NEXT_PARAM, PUBLIC_ROUTES, ROUTES } from '@/lib/routes';

/**
 * Decides which page shape to serve before the app renders.
 *
 * This is **not** the access control for the platform. It reads one cookie that
 * carries no token and verifies nothing (see `COOKIE_NAMES.sessionHint`), so
 * anyone can forge their way past it — and land on a screen whose every request
 * is rejected by the API, which does check signatures. What it buys is the
 * absence of a flash: a signed-out visitor goes straight to the login form
 * instead of watching an empty chat list appear and then vanish.
 *
 * Next 16 renamed this file from `middleware.ts` to `proxy.ts`; the behaviour is
 * unchanged. `request.cookies` is still synchronous here — it is `cookies()`
 * from `next/headers` that became async-only.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(COOKIE_NAMES.sessionHint);

  if (!hasSession) {
    if (PUBLIC_ROUTES.includes(pathname)) {
      return NextResponse.next();
    }
    // Remember where they were headed so signing in finishes the job instead of
    // dumping them on the chat list.
    const login = new URL(ROUTES.login, request.url);
    login.searchParams.set(NEXT_PARAM, `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  // Signed in: the login and register forms have nothing left to offer, and the
  // landing page is for visitors.
  if (AUTH_ROUTES.includes(pathname) || pathname === ROUTES.home) {
    return NextResponse.redirect(new URL(ROUTES.chats, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Without a matcher this runs on every asset request too, which would put a
  // cookie check in front of the stylesheet and the font.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
