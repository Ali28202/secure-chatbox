import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { logger } from 'hono/logger';
import { DOCS_PATH, undocumentedRoutes } from './docs/openapi';
import { env, isProduction } from './env';
import { errorHandler, notFoundHandler } from './lib/errors';
import { ipRestrictionMiddleware } from './middleware/ip-restriction';
import { attachmentRoutes } from './modules/attachment/attachment.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { chatRoutes } from './modules/chat/chat.routes';
import { userRoutes } from './modules/user/user.routes';
import { docsRoutes } from './routes/docs';
import { healthRoutes } from './routes/health';
import type { AppEnv } from './types';

export const app = new Hono<AppEnv>();

app.use('*', logger());

app.use('*', ipRestrictionMiddleware);

app.use('*', cors({ origin: env.CORS_ORIGINS, credentials: true }));

app.use('*', csrf({ origin: env.CORS_ORIGINS }));

app.onError(errorHandler);
app.notFound(notFoundHandler);

app.get('/', (c) => c.json({ name: 'Secure Chatbox API', status: 'active' }));

app.route('/api/health', healthRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/chats', chatRoutes);
app.route('/api/users', userRoutes);
app.route('/api/attachments', attachmentRoutes);

app.route(DOCS_PATH, docsRoutes);

if (!isProduction) {
  const missing = undocumentedRoutes(app.routes);

  if (missing.length > 0) {
    console.warn(
      `[docs] ${missing.length} route(s) are not in the OpenAPI document:\n  ${missing.join('\n  ')}`
    );
  }
}
