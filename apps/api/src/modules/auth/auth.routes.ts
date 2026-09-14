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
    // Behind nginx the socket address is the proxy, so the forwarded header is
    // the only useful value. It is a label in a list and nothing decides on it,
    // which is why trusting a spoofable header is acceptable here and would not
    // be for an access rule.
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
  // Best-effort: the cookies go regardless, but revoking the row is what stops
  // a refresh token someone already copied from working after you log out.
  const token = getCookie(c, COOKIE_NAMES.access);

  if (token) {
    try {
      const { user, sessionId } = await authService.verifyToken(token);
      await authService.revokeSessions(user.id, { sessionId });
    } catch {
      // An expired or already-revoked session is still a successful logout.
    }
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

/** Everything except the one making the request — the "sign out everywhere" button. */
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

  // Ending the session you are using is a logout, so the cookies have to go
  // with it or the next request would carry a token whose row is dead.
  if (isCurrent) clearAuthCookies(c);

  return c.json({ success: true });
});

/** Revoking a row does not close a socket that is already open. This does. */
async function disconnectAll(userId: string, deviceIds: string[]): Promise<void> {
  await Promise.all(
    deviceIds.map((deviceId) =>
      socketGateway
        .disconnectDevice(userId, deviceId)
        .catch((error: unknown) => console.error('failed to evict revoked session', error))
    )
  );
}

/** The signed-in user. `requireAuth` has already loaded it. */
authRoutes.get('/me', requireAuth, (c) => c.json(toUserDto(c.get('user'))));
