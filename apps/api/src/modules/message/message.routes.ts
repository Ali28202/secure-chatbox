import { zValidator } from '@hono/zod-validator';
import {
  listMessagesQuerySchema,
  markReadSchema,
  sendMessageSchema,
  UPLOAD,
  uploadMessageSchema,
  type UploadMessageInput,
} from '@repo/shared';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { Errors } from '../../lib/errors';
import { onValidationError, parseOrThrow } from '../../lib/validation';
import type { ChatEnv } from '../../types';
import { messageService } from './message.service';

/**
 * Mounted at `/api/chats/:chatId/messages`, below `requireChatMember`.
 *
 * There is no route here that takes a chat id: the only chat these handlers can
 * reach is the one the guard above them has already admitted the caller to. A
 * message endpoint that accepted its own `chatId` would be a second door into
 * the same room, and it would be the one nobody remembers to lock.
 */
export const messageRoutes = new Hono<ChatEnv>();

messageRoutes.get('/', zValidator('query', listMessagesQuerySchema, onValidationError), async (c) =>
  c.json(await messageService.getMessages(c.get('chatId'), c.req.valid('query')))
);

/**
 * The ceiling Bun is allowed to buffer for this route, checked against
 * `Content-Length` before the body is read.
 *
 * This is the outer bound on the whole request; the per-file cap and the file
 * count are enforced again in `storeUploads`, against the bytes that actually
 * arrived rather than against a header. Both are needed: a header can lie, and
 * a request with no `Content-Length` at all still has to stop somewhere.
 */
const sendBodyLimit = bodyLimit({
  maxSize: UPLOAD.maxRequestBytes,
  onError: () => {
    throw Errors.payloadTooLarge('حجم پیوست‌ها بیش از حد مجاز است.');
  },
});

/**
 * Sending, in either representation: JSON for a plain message, multipart when
 * there are files.
 *
 * One route rather than two, because whether a message carries a photo is a
 * property of how it was encoded and not of what it is. A second route would
 * have to repeat the permission check, the reply-scope check, the transaction
 * and the emit — the same duplication that keeping `sendMessage` and
 * `replyToMessage` as one method avoided.
 */
messageRoutes.post('/', sendBodyLimit, async (c) => {
  const { input, files } = isMultipart(c)
    ? await readMultipartSend(c)
    : { input: parseOrThrow(sendMessageSchema, await readJson(c)), files: [] as File[] };

  const message = await messageService.sendMessage(
    c.get('chat'),
    c.get('membership'),
    input,
    files
  );

  return c.json(message, 201);
});

/**
 * Declared before `/:messageId` would matter if they shared a method — they do
 * not, so this is only about reading order. `read` is a verb on the collection,
 * not a message id, and the schema is what stops one being mistaken for the
 * other: the id travels in the body.
 */
messageRoutes.post('/read', zValidator('json', markReadSchema, onValidationError), async (c) =>
  c.json(await messageService.markAsRead(c.get('chat'), c.get('membership'), c.req.valid('json')))
);

/**
 * Soft delete. Answers with the tombstoned message rather than `204`, so the
 * client can replace the row it already has instead of refetching the page to
 * find out what changed.
 */
messageRoutes.delete('/:messageId', async (c) =>
  c.json(
    await messageService.softDeleteMessage(
      c.get('chat'),
      c.get('membership'),
      c.req.param('messageId')
    )
  )
);

// -----------------------------------------------------------------------------

function isMultipart(c: Context<ChatEnv>): boolean {
  // `startsWith`, because the real header carries the part boundary after it:
  // `multipart/form-data; boundary=----WebKitFormBoundary…`.
  return (c.req.header('content-type') ?? '').toLowerCase().startsWith('multipart/form-data');
}

/**
 * `c.req.json()` for a body that may not be JSON at all.
 *
 * `zValidator` catches this case on every other route; here the parse is the
 * handler's, so the failure has to be translated by hand or a malformed body
 * would surface as an unhandled `SyntaxError` and a 500.
 */
async function readJson(c: Context<ChatEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw Errors.validation(
      [{ path: 'content', message: 'بدنهٔ درخواست معتبر نیست.' }],
      'بدنهٔ درخواست معتبر نیست.'
    );
  }
}

/**
 * The multipart branch: text fields validated by schema, file parts collected.
 *
 * `formData()` rather than Hono's `parseBody()` — the latter returns a single
 * value for a repeated field unless it is asked for arrays in the right way,
 * and a composer sending three photos must not lose two of them to a parsing
 * convention.
 */
async function readMultipartSend(
  c: Context<ChatEnv>
): Promise<{ input: UploadMessageInput; files: File[] }> {
  const form = await c.req.formData();

  // `getAll`, so every part named `files` is kept. The `instanceof` filter is
  // what stops a client sending `files` as a *string* and having it reach
  // `storeUploads` as something with no `.size` and no bytes.
  const files = form.getAll('files').filter((part): part is File => part instanceof File);

  // Absent rather than empty: a composer that always appends `content` would
  // otherwise turn a caption-less photo into a message whose text is `""`,
  // which is neither null in the database nor anything on screen.
  const text = (field: string): string | undefined => {
    const value = form.get(field);
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  };

  return {
    input: parseOrThrow(uploadMessageSchema, {
      content: text('content'),
      replyToId: text('replyToId'),
    }),
    files,
  };
}
