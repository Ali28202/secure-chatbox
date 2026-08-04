import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { logger } from 'hono/logger';
import { env } from './env';
import { errorHandler, notFoundHandler } from './lib/errors';
import { healthRoutes } from './routes/health';

/**
 * The Hono application: middleware, routes, error handling.
 *
 * Kept separate from `index.ts` so the app can be imported by tests, or later
 * by the Socket.io entrypoint, without any of them starting a server as a side
 * effect of the import.
 */
export const app = new Hono();

app.use('*', logger());

app.use('*', cors({ origin: env.CORS_ORIGINS, credentials: true }));

/**
 * Blocks cross-origin form posts. It deliberately ignores `application/json`
 * requests — those already require a CORS preflight, so a hostile page cannot
 * send one to begin with — which is also why `curl` with a JSON body still
 * works. Multipart uploads (M10) *are* covered and need a real `Origin`.
 */
app.use('*', csrf({ origin: env.CORS_ORIGINS }));

app.onError(errorHandler);
app.notFound(notFoundHandler);

app.get('/', (c) => c.json({ name: 'Secure Chatbox API', status: 'active' }));

app.route('/api/health', healthRoutes);
