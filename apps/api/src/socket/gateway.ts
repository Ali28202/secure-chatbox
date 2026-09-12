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

class SocketGateway {
  private io: AppSocketServer | null = null;

  private readonly connections = new Map<string, Set<string>>();

  attach(io: AppSocketServer): void {
    this.io = io;

    io.use((socket, next) => {
      void this.authenticate(socket).then(
        () => next(),
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

  emitToChat<Event extends keyof ServerToClientEvents>(
    chatId: string,
    event: Event,
    ...args: Parameters<ServerToClientEvents[Event]>
  ): void {
    this.io?.to(socketRooms.chat(chatId)).emit(event, ...args);
  }

  async joinChat(chatId: string, userId: string): Promise<void> {
    const io = this.io;
    if (!io || !this.isOnline(userId)) return;

    const room = socketRooms.chat(chatId);
    io.in(socketRooms.user(userId)).socketsJoin(room);

    io.to(room).emit('presence:changed', { userId, isOnline: true });
    io.to(socketRooms.user(userId)).emit('presence:sync', await this.onlineUsersIn([room], userId));
  }

  leaveChat(chatId: string, userId: string): void {
    const io = this.io;
    if (!io) return;

    const room = socketRooms.chat(chatId);

    io.to(room).emit('presence:changed', { userId, isOnline: false });
    io.in(socketRooms.user(userId)).socketsLeave(room);
  }

  isOnline(userId: string): boolean {
    return this.connections.has(userId);
  }

  /** Every socket this person has open, on any device. */
  async disconnectUser(userId: string): Promise<void> {
    const io = this.io;
    if (!io) return;

    const sockets = await io.in(socketRooms.user(userId)).fetchSockets();
    for (const socket of sockets) socket.disconnect(true);
  }

  async disconnectDevice(userId: string, deviceId: string): Promise<void> {
    const io = this.io;
    if (!io) return;

    const sockets = await io.in(socketRooms.user(userId)).fetchSockets();

    for (const socket of sockets) {
      if (socket.data.deviceId === deviceId) socket.disconnect(true);
    }
  }

  private async authenticate(socket: AppSocket): Promise<void> {
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    const token = cookies[COOKIE_NAMES.access];

    if (!token) {
      throw new Error(SOCKET_UNAUTHORIZED);
    }

    const { user, deviceId } = await authService.verifyToken(token);
    socket.data.userId = user.id;
    socket.data.deviceId = deviceId;
  }

  private async onConnection(socket: AppSocket): Promise<void> {
    const { userId } = socket.data;

    let chatRooms: string[] = [];

    socket.on('disconnecting', () => {
      this.onDisconnecting(socket, chatRooms);
    });

    socket.on('chat:join', (chatId: string) => {
      void this.onChatJoin(socket, chatId);
    });

    socket.on('typing:start', (chatId: string) => {
      this.onTyping(socket, chatId, true);
    });

    socket.on('typing:stop', (chatId: string) => {
      this.onTyping(socket, chatId, false);
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

    if (!socket.connected) return;

    chatRooms = memberships.map(({ chatId }) => socketRooms.chat(chatId));
    if (chatRooms.length === 0) {
      socket.emit('presence:sync', []);
      return;
    }

    await socket.join(chatRooms);

    socket.emit('presence:sync', await this.onlineUsersIn(chatRooms, userId));

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

    if (chatRooms.length > 0) {
      socket.to(chatRooms).emit('presence:changed', { userId, isOnline: false });
    }

    void prisma.user
      .update({ where: { id: userId }, data: { lastSeen: new Date() } })
      .catch((error: unknown) => console.error('failed to stamp lastSeen', error));
  }

  /**
   * Relayed, never stored. The room check is the authorization: a socket is
   * only ever in `chat:<id>` if `onConnection` or `onChatJoin` put it there
   * after reading the membership row, so a client that invents a chat id gets
   * nothing. Without it, anyone could announce themselves into any chat.
   */
  private onTyping(socket: AppSocket, chatId: string, isTyping: boolean): void {
    if (typeof chatId !== 'string') return;

    const room = socketRooms.chat(chatId);
    if (!socket.rooms.has(room)) return;

    socket.to(room).emit('typing:changed', { chatId, userId: socket.data.userId, isTyping });
  }

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

  private async onlineUsersIn(rooms: string[], excludeUserId: string): Promise<string[]> {
    const io = this.io;
    if (!io || rooms.length === 0) return [];

    const sockets = await io.in(rooms).fetchSockets();
    const userIds = new Set(sockets.map((socket) => socket.data.userId));
    userIds.delete(excludeUserId);

    return [...userIds];
  }
}

export const socketGateway = new SocketGateway();
