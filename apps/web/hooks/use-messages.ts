'use client';

import type { MarkReadResultDto, MessageDto, MessagePageDto, SendMessageInput } from '@repo/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { applyChatActivity, applyChatTombstone, applyMarkRead } from './use-chats';

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
 * What the composer hands `useSendMessage`.
 *
 * Looser than `SendMessageInput` in exactly one place: `content` is optional,
 * because a message carrying files does not need any. Which of the two request
 * shapes goes out is decided from `files` alone — the caller never picks an
 * encoding.
 */
export interface SendMessagePayload {
  content?: string;
  replyToId?: string;
  files?: File[];
}

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
            // too, or the content survives in every answer to it. The count goes
            // with it: the server drops the attachment rows on a soft delete, so
            // a quote still claiming «۲ پیوست» would be pointing at nothing.
            message.replyTo?.id === tombstone.id
            ? {
                ...message,
                replyTo: {
                  ...message.replyTo,
                  content: null,
                  isDeleted: true,
                  attachmentCount: 0,
                },
              }
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
 *
 * `unread` is passed straight through to the sidebar — see `applyChatActivity`
 * for why the decision is the caller's.
 */
export function applyIncomingMessage(
  queryClient: QueryClient,
  message: MessageDto,
  unread = false
): void {
  queryClient.setQueryData<MessagesCache>(messagesQueryKey(message.chatId), (cache) =>
    withMessage(cache, message)
  );
  applyChatActivity(queryClient, message, unread);
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
    mutationFn: async ({ content, replyToId, files = [] }: SendMessagePayload) => {
      const path = `/chats/${chatId}/messages`;

      if (files.length === 0) {
        const body: SendMessageInput = {
          content: content ?? '',
          ...(replyToId ? { replyToId } : {}),
        };
        return (await api.post<MessageDto>(path, body)).data;
      }

      const form = new FormData();
      // Omitted rather than sent empty — a photo with no caption is a message
      // whose `content` is null, not one whose content is the empty string.
      if (content) form.append('content', content);
      if (replyToId) form.append('replyToId', replyToId);
      // Repeated under one name; the API reads them with `getAll`.
      for (const file of files) form.append('files', file);

      return (
        await api.post<MessageDto>(path, form, {
          // Cleared, not replaced. The instance sets `application/json` on every
          // request, and axios reads that header back before it sends: seeing
          // JSON, it would serialise the FormData *into* JSON and the files
          // would arrive as `{}`. With no type set, the browser writes its own
          // `multipart/form-data` header — which it must, because only it knows
          // the part boundary it generated.
          headers: { 'Content-Type': null },
        })
      ).data;
    },
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

/**
 * Reports how far this reader has got, as far as `upToMessageId` inclusive.
 *
 * One call per settled scroll, not one per message — the endpoint takes a
 * watermark and advances every receipt behind it. Thirty messages caught up on
 * in one flick of the wrist cost one request.
 *
 * Failures are swallowed on purpose: there is no `onError`, and none of the
 * three callers passes one. A read receipt that did not make it is worth
 * nothing to the reader and a toast about it would be an interruption in
 * exchange for information they cannot act on. The next settle sends a
 * watermark at least as far along, so the state repairs itself.
 */
export function useMarkRead(chatId: string, viewerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (upToMessageId: string) =>
      (await api.post<MarkReadResultDto>(`/chats/${chatId}/messages/read`, { upToMessageId })).data,
    onSuccess: (result) => applyMarkRead(queryClient, result, viewerId),
  });
}
