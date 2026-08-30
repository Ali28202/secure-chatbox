import { prisma } from '@repo/database';
import { Hono } from 'hono';
import { Errors } from '../../lib/errors';
import { s3Storage } from '../../lib/s3';
import { requireAuth } from '../../middleware/require-auth';
import type { AppEnv } from '../../types';

export const attachmentRoutes = new Hono<AppEnv>();

attachmentRoutes.use('*', requireAuth);

attachmentRoutes.get('/:attachmentId', async (c) => {
  const userId = c.get('user').id;

  const attachment = await prisma.attachment.findFirst({
    where: {
      id: c.req.param('attachmentId'),
      message: {
        isDeleted: false,
        chat: { members: { some: { userId } } },
      },
    },
    select: { s3ObjectKey: true, fileType: true },
  });

  if (!attachment) {
    throw Errors.notFound('این فایل در دسترس نیست.');
  }

  const url = s3Storage.getSignedUrl(attachment.s3ObjectKey, attachment.fileType);

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      'Cache-Control': 'no-store',
    },
  });
});
