import { zValidator } from '@hono/zod-validator';
import { COOKIE_NAMES, loginSchema, registerSchema } from '@repo/shared';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { clearAuthCookies, setAuthCookies } from '../../lib/cookies';
import { Errors } from '../../lib/errors';
import { toSessionDto, toUserDto } from '../../lib/mappers';
import { onValidationError } from '../../lib/validation';
import { requireAuth } from '../../middleware/require-auth';
import { socketGateway } from '../../socket/gateway';
import type { AppEnv } from '../../types';
import { authService } from './auth.service';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/register', zValidator('json', registerSchema, onValidationError), async (c) => {
  const user = await authService.register(c.req.valid('json'));
  return c.json(user, 201);
});

authRoutes.post('/login', zValidator('json', loginSchema, onValidationError), async (c) => {
  const { user, tokens, revokedDeviceId } = await authService.login(c.req.valid('json'), {
    userAgent: c.req.header('user-agent') ?? null,
    ipAddress: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  });
  setAuthCookies(c, tokens);

  if (revokedDeviceId) {
    await socketGateway
      .disconnectDevice(user.id, revokedDeviceId)
      .catch((error: unknown) => console.error('failed to evict displaced device', error));
  }

  return c.json(user);
});

authRoutes.post('/refresh', async (c) => {
  const token = getCookie(c, COOKIE_NAMES.refresh);

  try {
    if (!token) {
      throw Errors.unauthorized('نشستت تموم شده. دوباره وارد شو.');
    }

    const { user, tokens } = await authService.refresh(token);
    setAuthCookies(c, tokens);
    return c.json(user);
  } catch (error) {
    clearAuthCookies(c);
    throw error;
  }
});

authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, COOKIE_NAMES.access);

  if (token) {
    await authService
      .verifyToken(token)
      .then(({ user, sessionId }) => authService.revokeSessions(user.id, { sessionId }))
      .catch(() => undefined);
  }

  clearAuthCookies(c);
  return c.json({ success: true });
});

authRoutes.get('/sessions', requireAuth, async (c) => {
  const sessions = await authService.listSessions(c.get('user').id);
  return c.json({
    sessions: sessions.map((session) => toSessionDto(session, c.get('sessionId'))),
  });
});

authRoutes.delete('/sessions', requireAuth, async (c) => {
  const deviceIds = await authService.revokeSessions(c.get('user').id, {
    exceptSessionId: c.get('sessionId'),
  });

  await disconnectAll(c.get('user').id, deviceIds);

  return c.json({ success: true, revoked: deviceIds.length });
});

authRoutes.delete('/sessions/:sessionId', requireAuth, async (c) => {
  const sessionId = c.req.param('sessionId');
  const isCurrent = sessionId === c.get('sessionId');

  const deviceIds = await authService.revokeSessions(c.get('user').id, { sessionId });

  if (deviceIds.length === 0) {
    throw Errors.notFound('این نشست نیست یا از قبل تموم شده.');
  }

  await disconnectAll(c.get('user').id, deviceIds);

  if (isCurrent) clearAuthCookies(c);

  return c.json({ success: true });
});

async function disconnectAll(userId: string, deviceIds: string[]): Promise<void> {
  await Promise.all(
    deviceIds.map((deviceId) =>
      socketGateway
        .disconnectDevice(userId, deviceId)
        .catch((error: unknown) => console.error('failed to evict revoked session', error))
    )
  );
}

authRoutes.get('/me', requireAuth, (c) => c.json(toUserDto(c.get('user'))));
