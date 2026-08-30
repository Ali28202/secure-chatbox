import { zValidator } from '@hono/zod-validator';
import { COOKIE_NAMES, loginSchema, registerSchema } from '@repo/shared';
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { clearAuthCookies, setAuthCookies } from '../../lib/cookies';
import { Errors } from '../../lib/errors';
import { toUserDto } from '../../lib/mappers';
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
  const { user, tokens, revokedDeviceId } = await authService.login(c.req.valid('json'));
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

authRoutes.post('/logout', (c) => {
  clearAuthCookies(c);
  return c.json({ success: true });
});

/** The signed-in user. `requireAuth` has already loaded it. */
authRoutes.get('/me', requireAuth, (c) => c.json(toUserDto(c.get('user'))));
