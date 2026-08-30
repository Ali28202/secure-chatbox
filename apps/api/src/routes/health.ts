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
      'ارتباط با پایگاه داده برقرار نشد. لطفاً بعداً تلاش کنید.'
    );
  }
});

export const echoSchema = z.object({
  message: z
    .string({ error: 'متن پیام را وارد کنید.' })
    .trim()
    .min(1, { error: 'پیام نمی‌تواند خالی باشد.' })
    .max(200, { error: 'پیام نمی‌تواند بیشتر از ۲۰۰ کاراکتر باشد.' }),
  repeat: z.coerce
    .number({ error: 'تعداد تکرار باید یک عدد باشد.' })
    .int({ error: 'تعداد تکرار باید عدد صحیح باشد.' })
    .min(1, { error: 'تعداد تکرار باید دست‌کم ۱ باشد.' })
    .max(5, { error: 'تعداد تکرار نمی‌تواند بیشتر از ۵ باشد.' })
    .default(1),
});

if (!isProduction) {
  healthRoutes.post('/echo', zValidator('json', echoSchema, onValidationError), (c) => {
    const { message, repeat } = c.req.valid('json');
    return c.json({ echoed: Array.from({ length: repeat }, () => message) });
  });
}
