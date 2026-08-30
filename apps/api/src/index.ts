import { Server as Engine, type WebSocketData } from '@socket.io/bun-engine';
import { SOCKET_PATH, UPLOAD } from '@repo/shared';
import { Server } from 'socket.io';
import { app } from './app';
import { env } from './env';
import { socketGateway, type AppSocketServer } from './socket/gateway';

const io: AppSocketServer = new Server();

const engine = new Engine({
  path: SOCKET_PATH,
  cors: { origin: env.CORS_ORIGINS, credentials: true },
});

io.bind(engine as unknown as Parameters<typeof io.bind>[0]);

socketGateway.attach(io);

const { websocket, idleTimeout, maxRequestBodySize } = engine.handler();

console.info(`API listening on http://localhost:${env.API_PORT} (${env.NODE_ENV})`);

export default {
  port: env.API_PORT,
  websocket,
  idleTimeout,
  maxRequestBodySize: Math.max(maxRequestBodySize, UPLOAD.maxRequestBytes * 2),
  fetch(request: Request, server: Bun.Server<WebSocketData>) {
    if (new URL(request.url).pathname.startsWith(SOCKET_PATH)) {
      return engine.handleRequest(request, server);
    }

    return app.fetch(request, server);
  },
};
