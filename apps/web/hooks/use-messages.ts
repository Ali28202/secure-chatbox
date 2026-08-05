'use client';

import type { MessageDto, MessagePageDto, SendMessageInput } from '@repo/shared';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { chatsQueryKey } from './use-chats';

/*
 * Deliberately *not* `['chats', chatId, 'messages']`. React Query matches keys
 * by prefix, so nesting the history under the chat key would make the routine
 * `invalidateQueries({ queryKey: chatsQueryKey })` below — which only means to
 * refresh the sidebar — also refetch this infinite query, throwing away every
 * page but the newest and undoing the write that triggered it.
 */
export const messagesQueryKey = (chatId: string) => ['messages', chatId] as const;

type MessagesCache = { pages: MessagePageDto[]; pageParams: (string | null)[] };

/**
 * Chat history, oldest page fetched last.
 *
 * The API answers newest-first, and each page is a keyset anchored to the
 * oldest row already held, so scrolling up appends a page rather than shifting
 * everything below it. `MessageList` reverses for display; keeping the cache in
 * the server's order is what lets `nextCursor` be used verbatim.
 */
export function useMessages(chatId: string) {
  return useInfiniteQuery({
    queryKey: messagesQueryKey(chatId),
    queryFn: async ({ pageParam }) =>
      (
        await api.get<MessagePageDto>(`/chats/${chatId}/messages`, {
          params: pageParam ? { before: pageParam } : undefined,
        })
      ).data,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // Same reasoning as `useChat`: a 404 means the chat is gone or was never
    // yours, and neither improves by asking again.
    retry: false,
  });
}

/**
 * Posts a message and puts the server's copy straight into the cache.
 *
 * Writing it in rather than invalidating matters: an invalidate refetches only
 * the *first* page, and React Query drops every older page that was already
 * scrolled through — the history would collapse under the sender every time
 * they spoke. Until M8's socket arrives, this is also the only way the sender
 * sees their own message without a reload.
 */
export function useSendMessage(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SendMessageInput) =>
      (await api.post<MessageDto>(`/chats/${chatId}/messages`, input)).data,
    onSuccess: (message) => {
      queryClient.setQueryData<MessagesCache>(messagesQueryKey(chatId), (cache) => {
        if (!cache) return cache;
        const [newest, ...rest] = cache.pages;
        if (!newest) return cache;

        return {
          ...cache,
          pages: [{ ...newest, messages: [message, ...newest.messages] }, ...rest],
        };
      });

      // The sidebar shows this chat's last message and orders by it, so both
      // are now stale.
      void queryClient.invalidateQueries({ queryKey: chatsQueryKey });
    },
  });
}

/**
 * Soft-deletes a message and swaps the tombstone the server returns into place.
 *
 * The row keeps its position — that is the whole point of a soft delete — so
 * this is a replace, never a removal.
 */
export function useDeleteMessage(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) =>
      (await api.delete<MessageDto>(`/chats/${chatId}/messages/${messageId}`)).data,
    onSuccess: (tombstone) => {
      queryClient.setQueryData<MessagesCache>(messagesQueryKey(chatId), (cache) =>
        cache
          ? {
              ...cache,
              pages: cache.pages.map((page) => ({
                ...page,
                messages: page.messages.map((message) =>
                  message.id === tombstone.id
                    ? tombstone
                    : // A reply quoting the deleted message has to lose the quoted
                      // text too, or the content survives in every answer to it.
                      message.replyTo?.id === tombstone.id
                      ? {
                          ...message,
                          replyTo: { ...message.replyTo, content: null, isDeleted: true },
                        }
                      : message
                ),
              })),
            }
          : cache
      );

      void queryClient.invalidateQueries({ queryKey: chatsQueryKey });
    },
  });
}
