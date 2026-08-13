import { prisma } from '@repo/database';
import { Hono } from 'hono';
import { Errors } from '../../lib/errors';
import { s3Storage } from '../../lib/s3';
import { requireAuth } from '../../middleware/require-auth';
import type { AppEnv } from '../../types';

/**
 * Mounted at `/api/attachments`. Downloads, and nothing else.
 *
 * The bucket is private and stays private — no public read policy, no static
 * root, no URL that works for whoever finds it. A URL is exactly the thing that
 * leaks: pasted into a ticket, forwarded, sitting in a browser history. A
 * supervision chat's attachment has to be as private as the message that
 * carried it, and the only place that knows who may read that message is this
 * database.
 *
 * So every download comes through here for the membership check, and what goes
 * back is not the bytes but a *redirect* to a signed URL that expires in
 * minutes. The browser then fetches from the store directly. Authorization
 * happens on every single access, the API never becomes a byte pump for a
 * semester of coursework, and a URL that escapes is worthless by the time
 * anyone tries it.
 */
export const attachmentRoutes = new Hono<AppEnv>();

attachmentRoutes.use('*', requireAuth);

attachmentRoutes.get('/:attachmentId', async (c) => {
  const userId = c.get('user').id;

  // Membership is part of the `where`, not a check that follows it. Written as
  // a filter, "not yours" and "does not exist" are the same query returning no
  // rows — which is what makes the 404 below honest rather than a 403 wearing a
  // disguise. Probing ids tells an outsider nothing.
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

  // `fileType` comes from the row — the type the bytes were checked against
  // when they were stored — and rides into the signature, so the store sends it
  // back and the browser cannot be talked into a different one.
  const url = s3Storage.getSignedUrl(attachment.s3ObjectKey, attachment.fileType);

  // Built by hand rather than with `c.redirect`, because the header below is
  // the whole point and it must not be at the mercy of anything merging
  // defaults over it.
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      // A cached redirect outlives the signature it points at, and would then
      // serve a dead URL to the one person allowed to have a live one. `Found`
      // rather than a permanent redirect for the same reason: the answer to
      // this request is only true for the next few minutes.
      'Cache-Control': 'no-store',
    },
  });
});
