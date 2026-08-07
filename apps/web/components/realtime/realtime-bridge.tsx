'use client';

import type { MessageDto, PresenceChange } from '@repo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { chatsQueryKey } from '@/hooks/use-chats';
import { applyDeletedMessage, applyIncomingMessage, messagesRootKey } from '@/hooks/use-messages';
import { disconnectSocket, getSocket, installAuthRecovery } from '@/lib/socket';
import { usePresenceStore } from '@/stores/presence-store';

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

  useEffect(() => {
    const socket = getSocket();
    const presence = usePresenceStore.getState();

    const onMessage = (message: MessageDto) => applyIncomingMessage(queryClient, message);
    const onDeleted = (tombstone: MessageDto) => applyDeletedMessage(queryClient, tombstone);

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
    socket.on('presence:sync', onSync);
    socket.on('presence:changed', onPresence);
    socket.io.on('reconnect', onReconnect);

    const removeAuthRecovery = installAuthRecovery(socket);

    socket.connect();

    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:deleted', onDeleted);
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
  }, [queryClient]);

  return null;
}
