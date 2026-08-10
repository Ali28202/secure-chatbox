import { prisma } from '@repo/database';
import { isImageType } from '@repo/shared';
import { Hono } from 'hono';
import { Errors } from '../../lib/errors';
import { resolveStored } from '../../lib/storage';
import { requireAuth } from '../../middleware/require-auth';
import type { AppEnv } from '../../types';

/**
 * Mounted at `/api/attachments`. Downloads, and nothing else.
 *
 * Served by the API rather than handed to nginx as a static directory, which
 * would be simpler and wrong: a file under a static root is readable by anyone
 * who knows its URL, and a URL is exactly the thing that leaks — pasted into a
 * ticket, forwarded, sitting in a browser history. A private supervision chat's
 * attachment has to be as private as the message that carried it, and the only
 * place that knows who may read that message is the database.
 *
 * The cost is one query per download and no `sendfile`. On a campus LAN serving
 * a few hundred people that is not a tradeoff worth thinking about twice.
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
    select: { fileUrl: true, fileName: true, fileType: true, fileSize: true },
  });

  if (!attachment) {
    throw Errors.notFound('این فایل در دسترس نیست.');
  }

  const file = Bun.file(resolveStored(attachment.fileUrl));

  // The row can outlive the bytes — a restore from a database dump without the
  // volume, a half-finished cleanup. Answering 404 beats streaming a zero-byte
  // body that every client would render as a corrupt file.
  if (!(await file.exists())) {
    throw Errors.notFound('این فایل در دسترس نیست.');
  }

  return new Response(file.stream(), {
    headers: {
      // From the row, which is the type the bytes were checked against when
      // they were stored — never from the request and never sniffed.
      'Content-Type': attachment.fileType,
      'Content-Length': String(attachment.fileSize),
      // Images render in place; everything else downloads. `filename*` carries
      // the Persian name that `filename` cannot: an HTTP header is Latin-1, so
      // the plain parameter would mangle «گزارش نهایی.pdf» into noise.
      'Content-Disposition': `${isImageType(attachment.fileType) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      // The pairing that matters: `inline` invites the browser to render the
      // body, and this forbids it from deciding the body is something more
      // interesting than what the header says. Without it a .txt whose contents
      // begin with `<script>` is an XSS on this origin.
      'X-Content-Type-Options': 'nosniff',
      // A stored file never changes — the name is a fresh UUID per upload — so
      // it can be cached hard. `private` keeps it out of any shared proxy,
      // which for an authenticated response is the whole point.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
});
