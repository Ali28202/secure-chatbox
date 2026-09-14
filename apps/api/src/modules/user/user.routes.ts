import { zValidator } from '@hono/zod-validator';
import { AVATAR, userSearchSchema } from '@repo/shared';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { Errors } from '../../lib/errors';
import { onValidationError } from '../../lib/validation';
import { requireAuth } from '../../middleware/require-auth';
import type { AppEnv } from '../../types';
import { userService } from './user.service';

export const userRoutes = new Hono<AppEnv>();

userRoutes.use('*', requireAuth);

userRoutes.get('/', zValidator('query', userSearchSchema, onValidationError), async (c) =>
  c.json(await userService.search(c.get('user').id, c.req.valid('query')))
);

const avatarBodyLimit = bodyLimit({
  maxSize: AVATAR.maxBytes + 64 * 1024,
  onError: () => {
    throw Errors.payloadTooLarge('حجم عکس بیشتر از حد مجازه.');
  },
});

userRoutes.put('/me/avatar', avatarBodyLimit, async (c) => {
  const form = await c.req.formData();
  const file = form.get('avatar');

  if (!(file instanceof File)) {
    throw Errors.validation(
      [{ path: 'avatar', message: 'عکسی انتخاب نکردی.' }],
      'عکسی انتخاب نکردی.'
    );
  }

  return c.json(await userService.setAvatar(c.get('user').id, file));
});

userRoutes.delete('/me/avatar', async (c) =>
  c.json(await userService.clearAvatar(c.get('user').id))
);

/**
 * Streams the image rather than redirecting to a signed URL.
 *
 * An avatar is rendered in an `<img>`, which is a subresource: a cross-origin
 * redirect to the bucket would carry no cookie and the bucket answers no CORS.
 * Attachments can redirect because they are links the browser navigates to.
 */
userRoutes.get('/:userId/avatar', async (c) => {
  const avatar = await userService.readAvatar(c.req.param('userId'));

  if (!avatar) {
    throw Errors.notFound('این کاربر عکسی نداره.');
  }

  return new Response(avatar.bytes, {
    headers: {
      'Content-Type': avatar.type,
      // Private, because the request carried a cookie and the answer is only
      // for this reader. Short, because replacing an avatar should be visible
      // without waiting out a long cache.
      'Cache-Control': 'private, max-age=60',
    },
  });
});
