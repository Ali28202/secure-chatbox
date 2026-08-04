import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger'; // ۱. ایمپورت کردن لاگر

const app = new Hono();

// ۲. فعال کردن لاگر برای تمام روت‌ها
app.use('/*', logger());
app.use('/*', cors());

app.get('/', (c) => {
  return c.json({
    message: 'Secure Chatbox API is running with Hono & Bun!',
    status: 'Active',
  });
});

export default {
  port: 3001,
  fetch: app.fetch,
};
