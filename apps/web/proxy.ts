import { COOKIE_NAMES } from '@repo/shared';
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_ROUTES, NEXT_PARAM, PUBLIC_ROUTES, ROUTES } from '@/lib/routes';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(COOKIE_NAMES.sessionHint);

  if (!hasSession) {
    if (PUBLIC_ROUTES.includes(pathname)) {
      return NextResponse.next();
    }
    const login = new URL(ROUTES.login, request.url);
    login.searchParams.set(NEXT_PARAM, `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (AUTH_ROUTES.includes(pathname) || pathname === ROUTES.home) {
    return NextResponse.redirect(new URL(ROUTES.chats, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
