import type { MessageDto } from './dto';

/**
 * The realtime contract, typed once and imported by both sides.
 *
 * Socket.io's default typing lets `emit('mesage:new', …)` compile — a typo on
 * the server that no client is listening for, and a bug that looks exactly like
 * a network problem. Declaring the maps here makes both ends fail at build time
 * instead: the server cannot emit an event the client has no handler for, and
 * the client cannot mistype the payload it destructures.
 */

/**
 * Must match on both ends and in nginx (M12).
 *
 * The engine matches this path *exactly* for its own handler, so the API's
 * dispatch uses `startsWith` — engine.io appends nothing, but a client
 * configured with a query string or a trailing segment would otherwise fall
 * through to Hono and get a 404 that looks like a routing bug.
 */
export const SOCKET_PATH = '/socket.io/';

/**
 * Room names.
 *
 * Prefixed, because rooms share one namespace with socket ids: an unprefixed
 * room named after a chat id could in principle collide with a socket id, and
 * `emit` would then reach one connection instead of a conversation.
 */
export const socketRooms = {
  chat: (chatId: string) => `chat:${chatId}`,
  /** Every tab a single user has open — how a chat they were just added to reaches all of them. */
  user: (userId: string) => `user:${userId}`,
} as const;

/** Why the server refused the handshake. Sent as the error message. */
export const SOCKET_UNAUTHORIZED = 'UNAUTHORIZED';

export interface PresenceChange {
  userId: string;
  isOnline: boolean;
}

export interface ServerToClientEvents {
  /**
   * A message was posted in a chat this socket belongs to — including one this
   * same user sent from another tab, and including their own send echoed back.
   * Clients must therefore apply it by id rather than appending blindly.
   */
  'message:new': (message: MessageDto) => void;
  /** A message was soft-deleted; the payload is the tombstone, not the id. */
  'message:deleted': (message: MessageDto) => void;
  /**
   * Everyone already online that this socket shares a chat with.
   *
   * Sent on connect, and again when the user joins a new chat — so clients
   * **merge** it into what they already know rather than replacing it. Going
   * offline is only ever reported by `presence:changed`; a user's absence from
   * this list means "not covered by this batch", not "offline".
   */
  'presence:sync': (userIds: string[]) => void;
  'presence:changed': (change: PresenceChange) => void;
}

export interface ClientToServerEvents {
  /**
   * Joins a chat created or joined *after* this socket connected.
   *
   * Membership is re-checked server-side — the room a socket asks for is not
   * evidence it belongs there.
   */
  'chat:join': (chatId: string) => void;
}

/** Per-socket state the server hangs off `socket.data`. */
export interface SocketData {
  userId: string;
}
