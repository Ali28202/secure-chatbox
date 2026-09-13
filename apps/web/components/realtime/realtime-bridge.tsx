'use client';

import {
  TYPING_EXPIRY_MS,
  type MessageDto,
  type PresenceChange,
  type ReadReceipt,
  type TypingChange,
} from '@repo/shared';
import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useCurrentUser } from '@/hooks/use-auth';
import { applyChatUpdate, applyReadReceipt, chatQueryKey, chatsQueryKey } from '@/hooks/use-chats';
import {
  applyDeletedMessage,
  applyIncomingMessage,
  applyUpdatedMessage,
  messagesRootKey,
} from '@/hooks/use-messages';
import { disconnectSocket, getSocket, installAuthRecovery } from '@/lib/socket';
import { ROUTES } from '@/lib/routes';
import { usePresenceStore } from '@/stores/presence-store';
import { useTypingStore } from '@/stores/typing-store';

/** The chat a `/chats/<id>` path is showing, or null anywhere else. */
function chatIdFromPath(pathname: string): string | null {
  const match = /^\/chats\/([^/]+)/.exec(pathname);
  return match?.[1] ?? null;
}

export function RealtimeBridge() {
  const queryClient = useQueryClient();
  const viewer = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();

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

    // Someone else deleted it. Drop the cached conversation and, if it is the
    // one on screen, leave — otherwise the page sits on a chat that is gone.
    const onChatDeleted = (chatId: string) => {
      queryClient.removeQueries({ queryKey: chatQueryKey(chatId) });
      void queryClient.invalidateQueries({ queryKey: chatsQueryKey });

      if (openChatRef.current === chatId) router.replace(ROUTES.chats);
    };

    // Expiry lives here, not in the store and not on the server. A tab closed
    // mid-word never sends `typing:stop`, so the indicator has to time itself
    // out; the sender re-announces on a heartbeat to keep it alive.
    const typing = useTypingStore.getState();
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const onTyping = ({ chatId, userId, isTyping }: TypingChange) => {
      const key = `${chatId}:${userId}`;

      const pending = typingTimers.get(key);
      if (pending !== undefined) clearTimeout(pending);

      if (!isTyping) {
        typingTimers.delete(key);
        typing.set(chatId, userId, false);
        return;
      }

      typing.set(chatId, userId, true);
      typingTimers.set(
        key,
        setTimeout(() => {
          typingTimers.delete(key);
          useTypingStore.getState().set(chatId, userId, false);
        }, TYPING_EXPIRY_MS)
      );
    };

    const onSync = (userIds: string[]) => presence.merge(userIds);
    const onPresence = ({ userId, isOnline }: PresenceChange) => presence.set(userId, isOnline);

    const onReconnect = () => {
      presence.clear();
      useTypingStore.getState().clear();
      void queryClient.invalidateQueries({ queryKey: chatsQueryKey });
      void queryClient.invalidateQueries({ queryKey: messagesRootKey });
    };

    socket.on('message:new', onMessage);
    socket.on('message:deleted', onDeleted);
    socket.on('message:updated', onUpdated);
    socket.on('chat:updated', onChatUpdated);
    socket.on('chat:deleted', onChatDeleted);
    socket.on('receipt:read', onReceipt);
    socket.on('presence:sync', onSync);
    socket.on('presence:changed', onPresence);
    socket.on('typing:changed', onTyping);
    socket.io.on('reconnect', onReconnect);

    const removeAuthRecovery = installAuthRecovery(socket);

    socket.connect();

    return () => {
      socket.off('message:new', onMessage);
      socket.off('message:deleted', onDeleted);
      socket.off('message:updated', onUpdated);
      socket.off('chat:updated', onChatUpdated);
      socket.off('chat:deleted', onChatDeleted);
      socket.off('receipt:read', onReceipt);
      socket.off('presence:sync', onSync);
      socket.off('presence:changed', onPresence);
      socket.off('typing:changed', onTyping);
      socket.io.off('reconnect', onReconnect);
      removeAuthRecovery();

      for (const timer of typingTimers.values()) clearTimeout(timer);
      typingTimers.clear();

      usePresenceStore.getState().clear();
      useTypingStore.getState().clear();
      disconnectSocket();
    };
  }, [queryClient, viewer.id, router]);

  return null;
}
