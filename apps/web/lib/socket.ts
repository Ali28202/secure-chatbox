'use client';

import {
  SOCKET_PATH,
  SOCKET_UNAUTHORIZED,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@repo/shared';
import { io, type Socket } from 'socket.io-client';
import { api, API_BASE_URL } from '@/lib/api';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * The one socket this tab has.
 *
 * A singleton rather than a connection per component, because React Strict Mode
 * mounts effects twice in development and every screen that wanted realtime
 * would otherwise open its own connection — multiplying the server's presence
 * bookkeeping and delivering every message several times over.
 */
let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  // `|| undefined`, where `lib/api.ts` deliberately uses `??`, and the
  // difference is not a slip. Behind nginx the deployment sets
  // `NEXT_PUBLIC_API_URL=""` so every path becomes same-origin — which axios
  // handles, because `"" + "/api"` is a relative URL. socket.io does not: it
  // treats the empty string as a URL it should parse, and `url("")` resolves to
  // `http://:80` with no host at all. Passing `undefined` is what makes it fall
  // back to `location`, which is exactly the origin nginx is serving.
  socket ??= io(API_BASE_URL || undefined, {
    path: SOCKET_PATH,
    // Same reason as axios: the handshake authenticates by cookie, and the
    // cookie is httpOnly so nothing here can attach it by hand.
    withCredentials: true,
    // The bridge connects once the session is confirmed. Connecting at import
    // time would hand the server a handshake before `/auth/me` has answered,
    // and on a cold load that is a handshake with no cookie yet.
    autoConnect: false,
    // Default transports on purpose: engine.io opens with HTTP polling and
    // upgrades to WebSocket, which is what produces the 101 in DevTools.
    // Forcing `['websocket']` skips the upgrade but has no fallback, so a
    // proxy that mishandles the upgrade leaves the app with no realtime at all
    // instead of a slower one.
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
  });

  return socket;
}

/**
 * Closes the connection and forgets it — on sign-out, so the next user does not
 * inherit the previous one's rooms.
 */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

/**
 * Recovers from a handshake the server refused.
 *
 * Socket.io authenticates once, at the handshake, so a socket that reconnects
 * after the 15-minute access token expired is turned away — and it will keep
 * being turned away, because reconnecting does not mint a new cookie. Refreshing
 * the session does, and the next attempt then carries it.
 *
 * At most one refresh per connection: socket.io's manager keeps retrying a
 * refused handshake on its own, and without the latch every one of those
 * retries would fire another `/auth/refresh` — which rotates both tokens, so a
 * refusal for any *other* reason would turn into a self-inflicted logout storm.
 * The latch lifts only when a handshake actually succeeds.
 */
export function installAuthRecovery(socket: AppSocket): () => void {
  let attempted = false;

  const onConnectError = (error: Error) => {
    if (error.message !== SOCKET_UNAUTHORIZED || attempted) return;
    attempted = true;

    api
      .post('/auth/refresh', {})
      .then(() => socket.connect())
      .catch(() => {
        // The session is genuinely over — a dead refresh token, or an account
        // that has been disabled. Stop knocking; the layout's session query is
        // what redirects to the login screen.
        socket.disconnect();
      });
  };

  const onConnect = () => {
    attempted = false;
  };

  socket.on('connect_error', onConnectError);
  socket.on('connect', onConnect);

  return () => {
    socket.off('connect_error', onConnectError);
    socket.off('connect', onConnect);
  };
}
