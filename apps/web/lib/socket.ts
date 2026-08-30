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

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  socket ??= io(API_BASE_URL || undefined, {
    path: SOCKET_PATH,
    withCredentials: true,
    autoConnect: false,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function installAuthRecovery(socket: AppSocket): () => void {
  let attempted = false;

  const onConnectError = (error: Error) => {
    if (error.message !== SOCKET_UNAUTHORIZED || attempted) return;
    attempted = true;

    api
      .post('/auth/refresh', {})
      .then(() => socket.connect())
      .catch(() => {
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
