'use client';

import type { MessageDto, MessagePageDto, SendMessageInput } from '@repo/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { applyChatActivity, applyChatTombstone } from './use-chats';

/*
 * Deliberately *not* `['chats', chatId, 'messages']`. React Query matches keys
 * by prefix, so nesting the history under the chat key would make the routine
 * `invalidateQueries({ queryKey: chatsQueryKey })` below — which only means to
 * refresh the sidebar — also refetch this infinite query, throwing away every
 * page but the newest and undoing the write that triggered it.
 */
export const messagesQueryKey = (chatId: string) => ['messages', chatId] as const;

/** Every chat's history at once — for the resync after a socket reconnect. */
export const messagesRootKey = ['messages'] as const;

type MessagesCache = { pages: MessagePageDto[]; pageParams: (string | null)[] };

/**
 * Puts a message at the top of the newest page — unless it is already there.
 *
 * The duplicate check is the whole point. Every message reaches the sender
 * twice: once as the response to their own POST, once as the socket echo the
 * server broadcasts to the chat. Without this the sender would see their own
 * message rendered twice, and React would warn about the repeated key.
 *
 * Only the newest page is searched. Older pages are keyset-anchored to rows
 * that already existed, so a message being inserted now cannot be in one.
 */
function withMessage(
  cache: MessagesCache | undefined,
  message: MessageDto
): MessagesCache | undefined {
  // Nothing to add to: this chat's history has not been opened in this tab, and
  // the fetch that eventually opens it will include this message anyway.
  if (!cache) return cache;

  const [newest, ...rest] = cache.pages;
  if (!newest || newest.messages.some((existing) => existing.id === message.id)) return cache;

  return { ...cache, pages: [{ ...newest, messages: [message, ...newest.messages] }, ...rest] };
}

/** Swaps a tombstone into place, and scrubs the text from every reply quoting it. */
function withTombstone(
  cache: MessagesCache | undefined,
  tombstone: MessageDto
): MessagesCache | undefined {
  if (!cache) return cache;

  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) =>
        message.id === tombstone.id
          ? tombstone
          : // A reply quoting the deleted message has to lose the quoted text
            // too, or the content survives in every answer to it.
            message.replyTo?.id === tombstone.id
            ? { ...message, replyTo: { ...message.replyTo, content: null, isDeleted: true } }
            : message
      ),
    })),
  };
}

/**
 * Applies a message that arrived over the socket.
 *
 * Exported for the realtime bridge, and written here rather than there so the
 * shape of this cache stays knowledge this file owns.
 */
export function applyIncomingMessage(queryClient: QueryClient, message: MessageDto): void {
  queryClient.setQueryData<MessagesCache>(messagesQueryKey(message.chatId), (cache) =>
    withMessage(cache, message)
  );
  applyChatActivity(queryClient, message);
}

export function applyDeletedMessage(queryClient: QueryClient, tombstone: MessageDto): void {
  queryClient.setQueryData<MessagesCache>(messagesQueryKey(tombstone.chatId), (cache) =>
    withTombstone(cache, tombstone)
  );
  applyChatTombstone(queryClient, tombstone);
}

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
 * they spoke.
 *
 * The socket echo for this same message arrives at roughly the same moment and
 * goes through `applyIncomingMessage`, which is idempotent — whichever lands
 * first wins and the other is a no-op. Writing it here as well is not
 * redundant: it means the message appears the instant the POST returns, even if
 * the socket happens to be reconnecting.
 */
export function useSendMessage(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SendMessageInput) =>
      (await api.post<MessageDto>(`/chats/${chatId}/messages`, input)).data,
    onSuccess: (message) => applyIncomingMessage(queryClient, message),
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
    onSuccess: (tombstone) => applyDeletedMessage(queryClient, tombstone),
  });
}
