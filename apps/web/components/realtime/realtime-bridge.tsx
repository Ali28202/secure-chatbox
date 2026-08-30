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

export function RealtimeBridge() {
  const queryClient = useQueryClient();
  const viewer = useCurrentUser();
  const pathname = usePathname();

  const openChatRef = useRef<string | null>(null);

  useEffect(() => {
    openChatRef.current = chatIdFromPath(pathname);
  }, [pathname]);

  useEffect(() => {
    const socket = getSocket();
    const presence = usePresenceStore.getState();

    const isUnread = (message: MessageDto) =>
      message.sender.id !== viewer.id &&
      !(message.chatId === openChatRef.current && document.visibilityState === 'visible');

    const onMessage = (message: MessageDto) =>
      applyIncomingMessage(queryClient, message, isUnread(message));
    const onDeleted = (tombstone: MessageDto) => applyDeletedMessage(queryClient, tombstone);
    const onUpdated = (message: MessageDto) => applyUpdatedMessage(queryClient, message);
    const onReceipt = (receipt: ReadReceipt) => applyReadReceipt(queryClient, receipt, viewer.id);

    const onChatUpdated = (chatId: string) => applyChatUpdate(queryClient, chatId);

    const onSync = (userIds: string[]) => presence.merge(userIds);
    const onPresence = ({ userId, isOnline }: PresenceChange) => presence.set(userId, isOnline);

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

      usePresenceStore.getState().clear();
      disconnectSocket();
    };
  }, [queryClient, viewer.id]);

  return null;
}
