export const ROUTES = {
  home: '/',
  login: '/login',
  register: '/register',
  chats: '/chats',
  chat: (chatId: string) => `/chats/${chatId}`,
  admin: '/admin',
  settings: '/settings',
} as const;

export const PUBLIC_ROUTES: string[] = [ROUTES.home, ROUTES.login, ROUTES.register];

export const AUTH_ROUTES: string[] = [ROUTES.login, ROUTES.register];

export const NEXT_PARAM = 'next';

export const DEVICE_MISMATCH_PARAM = 'device';

export function safeRedirectTarget(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return ROUTES.chats;
  }
  return value;
}
