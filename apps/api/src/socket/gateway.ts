import { prisma } from '@repo/database';
import {
  COOKIE_NAMES,
  SOCKET_UNAUTHORIZED,
  socketRooms,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@repo/shared';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import { parseCookieHeader } from '../lib/cookie-header';
import { authService } from '../modules/auth/auth.service';

export type AppSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;

/**
 * The realtime side of the API, as `SocketGateway` in the class diagram.
 *
 * Everything the rest of the codebase needs is a one-line call — `emitToChat`,
 * `joinChat`, `leaveChat` — and the services stay unaware of rooms, sockets and
 * whether anybody is even listening. That last part is why `io` is nullable
 * rather than assigned at import: under `bun test` or any script that imports a
 * service without starting a server, an emit has to be a no-op instead of a
 * crash.
 *
 * `connections` maps a user to their *sockets*, plural. One person routinely
 * has the app open in several tabs, and treating the second tab's disconnect as
 * "went offline" is the classic way presence ends up wrong.
 */
class SocketGateway {
  private io: AppSocketServer | null = null;

  private readonly connections = new Map<string, Set<string>>();

  attach(io: AppSocketServer): void {
    this.io = io;

    io.use((socket, next) => {
      void this.authenticate(socket).then(
        () => next(),
        // Whatever went wrong — no cookie, expired token, disabled account —
        // the client is told only that the handshake was refused. It already
        // knows how to recover (refresh, then reconnect) and the distinction
        // would leak which accounts exist, same as the login endpoint.
        () => next(new Error(SOCKET_UNAUTHORIZED))
      );
    });

    io.on('connection', (socket) => {
      void this.onConnection(socket).catch((error: unknown) => {
        console.error('socket connection setup failed', error);
        socket.disconnect(true);
      });
    });
  }

  /**
   * Sends an event to everyone currently in a chat.
   *
   * Call this *after* the transaction commits. Emitting from inside one sends a
   * message that a rollback then un-writes: every client renders a message the
   * database does not have, and only a refresh takes it back.
   */
  emitToChat<Event extends keyof ServerToClientEvents>(
    chatId: string,
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ): void {
    this.io?.to(socketRooms.chat(chatId)).emit(event, ...args);
  }

  /**
   * Puts every tab a user has open into a chat's room, for a chat they have
   * just been added to or just created.
   *
   * Without this, a new member receives nothing until they happen to reload —
   * their sockets connected before the membership existed, so the join at
   * connection time could not have included it.
   */
  async joinChat(chatId: string, userId: string): Promise<void> {
    const io = this.io;
    if (!io || !this.isOnline(userId)) return;

    const room = socketRooms.chat(chatId);
    io.in(socketRooms.user(userId)).socketsJoin(room);

    // The chat learns they are here, and they learn who else is. The second
    // emit is why `presence:sync` is specified as a merge rather than a
    // replacement — this is the one case where it arrives more than once.
    io.to(room).emit('presence:changed', { userId, isOnline: true });
    io.to(socketRooms.user(userId)).emit('presence:sync', await this.onlineUsersIn([room], userId));
  }

  leaveChat(chatId: string, userId: string): void {
    const io = this.io;
    if (!io) return;

    const room = socketRooms.chat(chatId);

    // Told before they are removed, or the notification goes to a room they are
    // no longer in and nobody hears it.
    io.to(room).emit('presence:changed', { userId, isOnline: false });
    io.in(socketRooms.user(userId)).socketsLeave(room);
  }

  isOnline(userId: string): boolean {
    return this.connections.has(userId);
  }

  // -------------------------------------------------------------------------

  /**
   * The handshake check.
   *
   * Socket.io authenticates once, here, and never again — a connection opened
   * with a valid token stays open after that token expires. That is acceptable
   * for a token this short-lived only because the socket carries no authority
   * of its own: it can receive events for rooms the server put it in, and the
   * one thing it can ask for (`chat:join`) is re-checked against the database.
   * Every action that changes anything still goes over HTTP, where the access
   * token is checked per request.
   */
  private async authenticate(socket: AppSocket): Promise<void> {
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    const token = cookies[COOKIE_NAMES.access];

    if (!token) {
      throw new Error(SOCKET_UNAUTHORIZED);
    }

    const user = await authService.verifyToken(token);
    socket.data.userId = user.id;
  }

  private async onConnection(socket: AppSocket): Promise<void> {
    const { userId } = socket.data;

    // Rooms are captured in this closure rather than re-read from
    // `socket.rooms` at teardown: by the time the disconnect is processed the
    // membership rows may already be gone, and the set would then be filtered
    // against a chat list that no longer includes the chat being left.
    let chatRooms: string[] = [];

    // Registered before the first `await`, so a connection that drops during
    // the lookup below still unwinds its bookkeeping.
    socket.on('disconnecting', () => {
      this.onDisconnecting(socket, chatRooms);
    });

    socket.on('chat:join', (chatId: string) => {
      void this.onChatJoin(socket, chatId);
    });

    const sockets = this.connections.get(userId);
    const isFirstConnection = sockets === undefined;
    if (sockets) sockets.add(socket.id);
    else this.connections.set(userId, new Set([socket.id]));

    await socket.join(socketRooms.user(userId));

    const memberships = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });

    // Disconnected while we were reading. Its teardown has already run against
    // an empty `chatRooms`, so joining now would leave the socket in rooms
    // nothing will ever remove it from.
    if (!socket.connected) return;

    chatRooms = memberships.map(({ chatId }) => socketRooms.chat(chatId));
    if (chatRooms.length === 0) {
      socket.emit('presence:sync', []);
      return;
    }

    await socket.join(chatRooms);

    socket.emit('presence:sync', await this.onlineUsersIn(chatRooms, userId));

    // Only the first tab announces the arrival — the second one is not news to
    // anybody, and the matching "went offline" only fires when the last tab
    // closes, so announcing per tab would put those two out of balance.
    if (isFirstConnection) {
      socket.to(chatRooms).emit('presence:changed', { userId, isOnline: true });
    }
  }

  private onDisconnecting(socket: AppSocket, chatRooms: string[]): void {
    const { userId } = socket.data;

    const sockets = this.connections.get(userId);
    if (!sockets) return;

    sockets.delete(socket.id);
    if (sockets.size > 0) return;

    this.connections.delete(userId);

    // Still inside the rooms at this point — `disconnecting` fires while the
    // socket is being removed from them, which is exactly why this listens to
    // it and not to `disconnect`, where the rooms are already gone.
    if (chatRooms.length > 0) {
      socket.to(chatRooms).emit('presence:changed', { userId, isOnline: false });
    }

    // Best-effort: this is what makes "last seen" mean anything once the tab is
    // closed. A failure here must not take the disconnect down with it.
    void prisma.user
      .update({ where: { id: userId }, data: { lastSeen: new Date() } })
      .catch((error: unknown) => console.error('failed to stamp lastSeen', error));
  }

  /**
   * Joins a chat the client has just discovered — one it created, or one it was
   * added to while connected.
   *
   * The membership is re-read rather than trusted: a socket asking for a room
   * is a request, not evidence, and this is the only inbound event the gateway
   * accepts. Failure is silent because there is nothing the user could do about
   * it; the room simply does not open.
   */
  private async onChatJoin(socket: AppSocket, chatId: string): Promise<void> {
    try {
      const membership = await prisma.chatMember.findUnique({
        where: { userId_chatId: { userId: socket.data.userId, chatId } },
        select: { chatId: true },
      });

      if (!membership || !socket.connected) return;

      await socket.join(socketRooms.chat(chatId));
    } catch (error) {
      console.error('chat:join failed', error);
    }
  }

  /**
   * Who is online among the occupants of these rooms, from the sockets
   * themselves rather than a database column.
   *
   * A `User.isOnline` flag would have to be written on connect and cleared on
   * disconnect, and every crashed process would leave a row claiming somebody
   * is still here. The room membership cannot drift from the truth because it
   * *is* the truth.
   */
  private async onlineUsersIn(rooms: string[], excludeUserId: string): Promise<string[]> {
    const io = this.io;
    // `io.in([])` matches no rooms, which socket.io reads as "everyone" — the
    // caller would get the whole server's presence.
    if (!io || rooms.length === 0) return [];

    const sockets = await io.in(rooms).fetchSockets();
    const userIds = new Set(sockets.map((socket) => socket.data.userId));
    userIds.delete(excludeUserId);

    return [...userIds];
  }
}

export const socketGateway = new SocketGateway();
