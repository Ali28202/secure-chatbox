// Aliased: the package's export is also called `Server`, and having two of
// those in one file is a mistake waiting to be made.
import { Server as Engine, type WebSocketData } from '@socket.io/bun-engine';
import { SOCKET_PATH } from '@repo/shared';
import { Server } from 'socket.io';
import { app } from './app';
import { env } from './env';
import { socketGateway, type AppSocketServer } from './socket/gateway';

/**
 * Bun entrypoint. Nothing but wiring lives here.
 *
 * Hono hands its lifecycle to `Bun.serve` through `export default {fetch}`, so
 * there is no `http.Server` for engine.io to attach to — `new Server()` alone
 * would bind to nothing and every client would hang on the opening
 * `GET /socket.io/?EIO=4&transport=polling`. `@socket.io/bun-engine` is the
 * missing half: it speaks engine.io over Bun's native WebSocket handlers, and
 * socket.io then binds to it exactly as it would to the Node engine.
 */

const io: AppSocketServer = new Server();

const engine = new Engine({
  path: SOCKET_PATH,
  // The socket is a separate origin from the web app in development (:3001 vs
  // :3000) and needs credentials, because the handshake authenticates by
  // cookie. Behind nginx in production there is one origin and this never
  // fires. Hono's own `cors()` cannot cover this: the engine answers these
  // requests before Hono ever sees them.
  cors: { origin: env.CORS_ORIGINS, credentials: true },
});

// socket.io's `bind` is typed against engine.io's `BaseServer`. This engine is
// a structural stand-in for it rather than a subclass — the whole point of the
// package — so the cast is the intended usage, not a workaround for a bug.
io.bind(engine as unknown as Parameters<typeof io.bind>[0]);

socketGateway.attach(io);

const { websocket, idleTimeout, maxRequestBodySize } = engine.handler();

console.info(`API listening on http://localhost:${env.API_PORT} (${env.NODE_ENV})`);

export default {
  port: env.API_PORT,
  websocket,
  // Derived from the engine's own `pingInterval` (2× it, ~50s), not hardcoded.
  // Bun's default is 10 seconds, which closes a healthy socket four times
  // between pings — it looks exactly like a flaky network and is impossible to
  // reproduce on demand, because it only happens in a conversation nobody is
  // typing in.
  idleTimeout,
  maxRequestBodySize,
  fetch(request: Request, server: Bun.Server<WebSocketData>) {
    // Explicit dispatch, rather than mounting a Hono route: the engine's own
    // handler matches `SOCKET_PATH` exactly, and routing this through Hono
    // would also put the global `cors()` middleware in front of a response that
    // already carries its own CORS headers — two `Access-Control-Allow-Origin`
    // headers, which the browser rejects outright.
    if (new URL(request.url).pathname.startsWith(SOCKET_PATH)) {
      return engine.handleRequest(request, server);
    }

    return app.fetch(request, server);
  },
};
