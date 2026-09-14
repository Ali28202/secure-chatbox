import { zValidator } from '@hono/zod-validator';
import {
  listMessagesQuerySchema,
  markReadSchema,
  pinMessageSchema,
  sendMessageSchema,
  toggleReactionSchema,
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

export const messageRoutes = new Hono<ChatEnv>();

messageRoutes.get('/', zValidator('query', listMessagesQuerySchema, onValidationError), async (c) =>
  c.json(await messageService.getMessages(c.get('chatId'), c.req.valid('query')))
);

const sendBodyLimit = bodyLimit({
  maxSize: UPLOAD.maxRequestBytes,
  onError: () => {
    throw Errors.payloadTooLarge('حجم پیوست‌ها بیشتر از حد مجازه.');
  },
});

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

messageRoutes.post('/read', zValidator('json', markReadSchema, onValidationError), async (c) =>
  c.json(await messageService.markAsRead(c.get('chat'), c.get('membership'), c.req.valid('json')))
);

messageRoutes.get('/pinned', async (c) =>
  c.json({ messages: await messageService.getPinnedMessages(c.get('chatId')) })
);

messageRoutes.patch(
  '/:messageId/pin',
  zValidator('json', pinMessageSchema, onValidationError),
  async (c) =>
    c.json(
      await messageService.setPinned(
        c.get('chat'),
        c.get('membership'),
        c.req.param('messageId'),
        c.req.valid('json').isPinned
      )
    )
);

messageRoutes.put(
  '/:messageId/reactions',
  zValidator('json', toggleReactionSchema, onValidationError),
  async (c) =>
    c.json(
      await messageService.toggleReaction(
        c.get('chat'),
        c.get('membership'),
        c.req.param('messageId'),
        c.req.valid('json').emoji
      )
    )
);

messageRoutes.delete('/:messageId', async (c) =>
  c.json(
    await messageService.softDeleteMessage(
      c.get('chat'),
      c.get('membership'),
      c.req.param('messageId')
    )
  )
);

function isMultipart(c: Context<ChatEnv>): boolean {
  return (c.req.header('content-type') ?? '').toLowerCase().startsWith('multipart/form-data');
}

async function readJson(c: Context<ChatEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw Errors.validation(
      [{ path: 'content', message: 'بدنهٔ درخواست درست نیست.' }],
      'بدنهٔ درخواست درست نیست.'
    );
  }
}

async function readMultipartSend(
  c: Context<ChatEnv>
): Promise<{ input: UploadMessageInput; files: File[] }> {
  const form = await c.req.formData();

  const files = form.getAll('files').filter((part): part is File => part instanceof File);

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
