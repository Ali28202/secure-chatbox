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
export interface TypingChange {
  chatId: string;
  userId: string;
  isTyping: boolean;
}

/**
 * How long a `typing:changed` with `isTyping: true` stays true if nothing
 * follows it. The sender re-announces every {@link TYPING_HEARTBEAT_MS}; a
 * receiver that stops hearing from them clears the indicator by itself.
 *
 * This is why nothing on the server holds a timer: a browser that is closed
 * mid-sentence never sends `typing:stop`, so an authoritative server-side flag
 * would stick forever. Expiry belongs with the receiver.
 */
export const TYPING_EXPIRY_MS = 5_000;
export const TYPING_HEARTBEAT_MS = 2_000;

export interface ServerToClientEvents {
  'message:new': (message: MessageDto) => void;
  'message:deleted': (message: MessageDto) => void;
  'message:updated': (message: MessageDto) => void;
  'presence:sync': (userIds: string[]) => void;
  'presence:changed': (change: PresenceChange) => void;
  'receipt:read': (receipt: ReadReceipt) => void;
  'chat:updated': (chatId: string) => void;
  'chat:deleted': (chatId: string) => void;
  'typing:changed': (change: TypingChange) => void;
}

export interface ClientToServerEvents {
  'chat:join': (chatId: string) => void;
  'typing:start': (chatId: string) => void;
  'typing:stop': (chatId: string) => void;
}
export interface SocketData {
  userId: string;
  deviceId: string;
}
