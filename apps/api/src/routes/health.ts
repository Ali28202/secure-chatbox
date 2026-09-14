import { zValidator } from '@hono/zod-validator';
import { prisma } from '@repo/database';
import { Hono } from 'hono';
import * as z from 'zod';
import { isProduction } from '../env';
import { AppError } from '../lib/errors';
import { onValidationError } from '../lib/validation';

export const healthRoutes = new Hono();

healthRoutes.get('/', (c) => c.json({ status: 'ok', uptime: process.uptime() }));

healthRoutes.get('/db', async (c) => {
  try {
    const users = await prisma.user.count();
    return c.json({ db: 'ok', users });
  } catch (error) {
    console.error('[health/db] database unreachable:', error);
    throw new AppError(
      503,
      'INTERNAL_ERROR',
      'به پایگاه داده وصل نشد. یه کم بعد دوباره امتحان کن.'
    );
  }
});

export const echoSchema = z.object({
  message: z
    .string({ error: 'متن پیام رو بنویس.' })
    .trim()
    .min(1, { error: 'پیام نمی‌تونه خالی باشه.' })
    .max(200, { error: 'پیام نباید بیشتر از ۲۰۰ کاراکتر باشه.' }),
  repeat: z.coerce
    .number({ error: 'تعداد تکرار باید عدد باشه.' })
    .int({ error: 'تعداد تکرار باید عدد درست باشه.' })
    .min(1, { error: 'تعداد تکرار باید حداقل ۱ باشه.' })
    .max(5, { error: 'تعداد تکرار نباید بیشتر از ۵ باشه.' })
    .default(1),
});

if (!isProduction) {
  healthRoutes.post('/echo', zValidator('json', echoSchema, onValidationError), (c) => {
    const { message, repeat } = c.req.valid('json');
    return c.json({ echoed: Array.from({ length: repeat }, () => message) });
  });
}
