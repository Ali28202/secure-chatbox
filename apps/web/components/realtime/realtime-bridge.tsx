'use client';

import type { MessageDto, PresenceChange, ReadReceipt } from '@repo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useCurrentUser } from '@/hooks/use-auth';
import { applyChatUpdate, applyReadReceipt, chatsQueryKey } from '@/hooks/use-chats';
import {
  applyDeletedMessage,
  applyIncomingMessage,
  applyUpdatedMessage,
  messagesRootKey,
} from '@/hooks/use-messages';
import { disconnectSocket, getSocket, installAuthRecovery } from '@/lib/socket';
import { usePresenceStore } from '@/stores/presence-store';

/** The chat a `/chats/<id>` path is showing, or null anywhere else. */
function chatIdFromPath(pathname: string): string | null {
  const match = /^\/chats\/([^/]+)/.exec(pathname);
  return match?.[1] ?? null;
}

/**
 * The only place socket events touch application state.
 *
 * Renders nothing. It exists because the connection is per-tab, not per-screen:
 * a message arriving for a conversation the user is not looking at still has to
 * reorder their sidebar, and a component that only mounts on the chat page
 * could not do that. Mounting it in the authenticated layout means one socket
 * for as long as the session lasts, regardless of what is on screen.
 *
 * It also means the cache is updated by exactly one listener. Wiring
 * `socket.on('message:new')` inside `MessageList` would attach a handler per
 * mounted chat and apply the same message once per listener — which the
 * idempotent appliers would survive, but only by accident.
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient();
  const viewer = useCurrentUser();
  const pathname = usePathname();

  /*
   * Held in a ref rather than read from `pathname` inside the handler.
   *
   * The subscription effect below must not depend on the route: re-running it
   * on every navigation would tear down and re-add four listeners each time a
   * chat is opened, and any event that arrived in between would land on nothing.
   * The handler reads the current value when it fires instead.
   */
  const openChatRef = useRef<string | null>(null);

  useEffect(() => {
    openChatRef.current = chatIdFromPath(pathname);
  }, [pathname]);

  useEffect(() => {
    const socket = getSocket();
    const presence = usePresenceStore.getState();

    /*
     * Whether this message should raise a badge.
     *
     * Not your own, obviously. And not one arriving in the conversation already
     * on screen in a foreground tab — that message is about to be read, and
     * lighting a badge the reader clears by continuing to sit still is a badge
     * that only ever announced itself. A backgrounded tab gets no such credit:
     * nobody is looking at it, so its count accumulates like any other.
     */
    const isUnread = (message: MessageDto) =>
      message.sender.id !== viewer.id &&
      !(message.chatId === openChatRef.current && document.visibilityState === 'visible');

    const onMessage = (message: MessageDto) =>
      applyIncomingMessage(queryClient, message, isUnread(message));
    const onDeleted = (tombstone: MessageDto) => applyDeletedMessage(queryClient, tombstone);
    const onUpdated = (message: MessageDto) => applyUpdatedMessage(queryClient, message);
    const onReceipt = (receipt: ReadReceipt) => applyReadReceipt(queryClient, receipt, viewer.id);

    // Only an id, so the only thing to do with it is re-read. See the event's
    // definition for why nothing richer could be broadcast: the row it
    // invalidates carries an unread count that differs per member.
    const onChatUpdated = (chatId: string) => applyChatUpdate(queryClient, chatId);

    const onSync = (userIds: string[]) => presence.merge(userIds);
    const onPresence = ({ userId, isOnline }: PresenceChange) => presence.set(userId, isOnline);

    /*
     * A reconnect means the tab was offline for some interval — a laptop lid, a
     * dropped intranet link — and every message sent during it was broadcast to
     * a socket that was not there. Socket.io does not replay them, so the only
     * honest recovery is to re-read from the API. Invalidating both roots
     * refetches whatever is actually being watched and leaves the rest stale
     * until it is.
     *
     * Only on `reconnect`, never on the first `connect`: at that point the
     * queries are either loading already or have just loaded, and invalidating
     * would double every request the page makes on load.
     */
    const onReconnect = () => {
      presence.clear();
      void queryClient.invalidateQueries({ queryKey: chatsQueryKey });
      void queryClient.invalidateQueries({ queryKey: messagesRootKey });
    };

    socket.on('message:new', onMessage);
    socket.on('message:deleted', onDeleted);
    socket.on('message:updated', onUpdated);
    socket.on('chat:updated', onChatUpdated);
    socket.on('receipt:read', onReceipt);
    socket.on('presence:sync', onSync);
    socket.on('presence:changed', onPresence);
    socket.io.on('reconnect', onReconnect);

    const removeAuthRecovery = installAuthRecovery(socket);

    socket.connect();

    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:deleted', onDeleted);
      socket.off('message:updated', onUpdated);
      socket.off('chat:updated', onChatUpdated);
      socket.off('receipt:read', onReceipt);
      socket.off('presence:sync', onSync);
      socket.off('presence:changed', onPresence);
      socket.io.off('reconnect', onReconnect);
      removeAuthRecovery();

      // Torn down entirely, not just unsubscribed: this effect's lifetime is the
      // signed-in session's, so unmounting means the shell went away — a logout
      // or a bounce to the login screen. Leaving the socket open would hold a
      // room membership for a session that no longer exists.
      usePresenceStore.getState().clear();
      disconnectSocket();
    };
  }, [queryClient, viewer.id]);

  return null;
}
