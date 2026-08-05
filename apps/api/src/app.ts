import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { logger } from 'hono/logger';
import { env } from './env';
import { errorHandler, notFoundHandler } from './lib/errors';
import { authRoutes } from './modules/auth/auth.routes';
import { healthRoutes } from './routes/health';
import type { AppEnv } from './types';

/**
 * The Hono application: middleware, routes, error handling.
 *
 * Kept separate from `index.ts` so the app can be imported by tests, or later
 * by the Socket.io entrypoint, without any of them starting a server as a side
 * effect of the import.
 */
export const app = new Hono<AppEnv>();

app.use('*', logger());

app.use('*', cors({ origin: env.CORS_ORIGINS, credentials: true }));

/**
 * Blocks cross-origin state changes that a browser would make without asking
 * permission first. It guards exactly the request shapes a hostile page can
 * send with no CORS preflight: form encodings, multipart (M10), `text/plain`,
 * and — the easy one to forget — **any request with no `Content-Type` at all**,
 * such as a bodyless `POST /api/auth/refresh`.
 *
 * `application/json` is deliberately not guarded: it always triggers a
 * preflight, so a hostile page never gets to send one. That is also why `curl`
 * with a JSON body works without ceremony while a bodyless `curl -X POST` gets
 * a 403 — real browsers always send `Origin`, so pass `-H 'Origin: <web url>'`
 * when testing those by hand.
 */
app.use('*', csrf({ origin: env.CORS_ORIGINS }));

app.onError(errorHandler);
app.notFound(notFoundHandler);

app.get('/', (c) => c.json({ name: 'Secure Chatbox API', status: 'active' }));

app.route('/api/health', healthRoutes);
app.route('/api/auth', authRoutes);
