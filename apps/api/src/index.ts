import { app } from './app';
import { env } from './env';

/**
 * Bun entrypoint. Nothing but wiring lives here — M8 will add the Socket.io
 * engine's `websocket` handler and an `idleTimeout` to this same object.
 */

console.info(`API listening on http://localhost:${env.API_PORT} (${env.NODE_ENV})`);

export default {
  port: env.API_PORT,
  fetch: app.fetch,
};
