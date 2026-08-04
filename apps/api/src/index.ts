import { prisma } from '@repo/database';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

const app = new Hono();

app.use('/*', logger());
app.use('/*', cors());

app.get('/', (c) =>
  c.json({
    message: 'Secure Chatbox API',
    status: 'active',
  })
);

/** Liveness — the process is up. Says nothing about the database. */
app.get('/api/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }));

/** Readiness — the database is reachable and migrated. */
app.get('/api/health/db', async (c) => {
  try {
    const users = await prisma.user.count();
    return c.json({ db: 'ok', users });
  } catch (error) {
    console.error('[health/db] database unreachable:', error);
    return c.json(
      { db: 'error', message: error instanceof Error ? error.message : 'unknown error' },
      503
    );
  }
});

const port = Number(process.env['API_PORT'] ?? 3001);

console.info(`API listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
