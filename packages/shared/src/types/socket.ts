import type { MessageDto } from './dto';

export const SOCKET_PATH = '/socket.io/';

export const socketRooms = {
  chat: (chatId: string) => `chat:${chatId}`,
  user: (userId: string) => `user:${userId}`,
} as const;

export const SOCKET_UNAUTHORIZED = 'UNAUTHORIZED';

export interface PresenceChange {
  userId: string;
  isOnline: boolean;
}
export interface ReadReceipt {
  chatId: string;
  userId: string;
  readAt: string;
}

export interface ServerToClientEvents {
  'message:new': (message: MessageDto) => void;
  'message:deleted': (message: MessageDto) => void;
  'message:updated': (message: MessageDto) => void;
  'presence:sync': (userIds: string[]) => void;
  'presence:changed': (change: PresenceChange) => void;
  'receipt:read': (receipt: ReadReceipt) => void;
  'chat:updated': (chatId: string) => void;
}

export interface ClientToServerEvents {
  'chat:join': (chatId: string) => void;
}
export interface SocketData {
  userId: string;
  deviceId: string;
}
