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

/**
 * One member's read watermark moved forward.
 *
 * Carries no unread count on purpose. Unread is per-viewer, and this event goes
 * to the whole chat room — a count in it would tell every member how much of
 * the conversation one particular person has left unread.
 */
export interface ReadReceipt {
  chatId: string;
  userId: string;
  /** ISO timestamp of the newest message this member has now read. */
  readAt: string;
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
   * An existing message changed without being deleted — today that means it was
   * pinned or unpinned.
   *
   * Named for the shape of the change rather than for pinning, because clients
   * apply it the same way whatever moved: replace the row with this id. A
   * `message:pinned` event would need a sibling for every future edit, each with
   * an identical handler.
   */
  'message:updated': (message: MessageDto) => void;
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
  /**
   * A member read up to a point in this chat.
   *
   * Everyone in the room uses it to move that member's tick marks. The reader's
   * *own* other tabs recognise their `userId` in it and refresh their unread
   * badge, which is why it is broadcast to the room rather than to the room
   * minus the sender.
   */
  'receipt:read': (receipt: ReadReceipt) => void;
  /**
   * Something about the chat itself changed: its title, its read-only setting,
   * or one member's role or mute state.
   *
   * Carries the id and nothing else, and that is the whole design. Every richer
   * payload would be per-viewer — `ChatListItemDto` holds an unread count and a
   * set of read watermarks that mean different things to each member — so one
   * broadcast object cannot be correct for the room it is sent to. This is an
   * invalidation signal: it says *what* went stale, and each client re-reads it
   * for itself.
   */
  'chat:updated': (chatId: string) => void;
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
  /**
   * The device whose token opened this connection.
   *
   * Recorded because the handshake is the *only* time a socket is
   * authenticated: once it is open, nothing re-reads the account. When a login
   * from a new device displaces this one, the server has to find these sockets
   * and close them, and this is what it matches on.
   */
  deviceId: string;
}
