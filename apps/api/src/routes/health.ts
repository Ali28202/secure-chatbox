import { zValidator } from '@hono/zod-validator';
import { prisma } from '@repo/database';
import { Hono } from 'hono';
import * as z from 'zod';
import { isProduction } from '../env';
import { AppError } from '../lib/errors';
import { onValidationError } from '../lib/validation';

export const healthRoutes = new Hono();

/** Liveness — the process is up. Says nothing about the database. */
healthRoutes.get('/', (c) => c.json({ status: 'ok', uptime: process.uptime() }));

/** Readiness — the database is reachable and migrated. */
healthRoutes.get('/db', async (c) => {
  try {
    const users = await prisma.user.count();
    return c.json({ db: 'ok', users });
  } catch (error) {
    console.error('[health/db] database unreachable:', error);
    // 503, not 500: the service is fine, its dependency is not. Orchestrators
    // and load balancers treat the two differently.
    throw new AppError(
      503,
      'INTERNAL_ERROR',
      'ارتباط با پایگاه داده برقرار نشد. لطفاً بعداً تلاش کنید.'
    );
  }
});

if (!isProduction) {
  const echoSchema = z.object({
    message: z
      .string({ error: 'متن پیام را وارد کنید.' })
      .trim()
      .min(1, { error: 'پیام نمی‌تواند خالی باشد.' })
      .max(200, { error: 'پیام نمی‌تواند بیشتر از ۲۰۰ نویسه باشد.' }),
    repeat: z.coerce
      .number({ error: 'تعداد تکرار باید یک عدد باشد.' })
      .int({ error: 'تعداد تکرار باید عدد صحیح باشد.' })
      .min(1, { error: 'تعداد تکرار باید دست‌کم ۱ باشد.' })
      .max(5, { error: 'تعداد تکرار نمی‌تواند بیشتر از ۵ باشد.' })
      .default(1),
  });

  /**
   * Exercises the whole request path — validator, error envelope, Persian
   * messages — without needing a real feature to exist yet. Development only;
   * an endpoint that reflects its input has no business in production.
   */
  healthRoutes.post('/echo', zValidator('json', echoSchema, onValidationError), (c) => {
    const { message, repeat } = c.req.valid('json');
    return c.json({ echoed: Array.from({ length: repeat }, () => message) });
  });
}
