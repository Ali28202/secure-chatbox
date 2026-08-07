'use client';

import type { ChatListItemDto, ChatDto, CreateChatPayload, MessageDto } from '@repo/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export const chatsQueryKey = ['chats'] as const;
export const chatQueryKey = (chatId: string) => ['chats', chatId] as const;

/**
 * The same ordering the API applies, so a locally reordered list and a freshly
 * fetched one agree. `lastMessageAt` nulls sort last — a chat nobody has
 * written in yet belongs below the conversations people are having, not above
 * them, which is where a plain descending sort would put it.
 */
function byRecency(a: ChatListItemDto, b: ChatListItemDto): number {
  if (a.lastMessageAt !== b.lastMessageAt) {
    if (!a.lastMessageAt) return 1;
    if (!b.lastMessageAt) return -1;
    return a.lastMessageAt < b.lastMessageAt ? 1 : -1;
  }
  return a.createdAt < b.createdAt ? 1 : -1;
}

/**
 * Moves a chat to the top of the sidebar and updates its preview line.
 *
 * Written into the cache rather than invalidated. An invalidate would put a
 * request on the wire for every message that arrives anywhere — in a course
 * group of thirty that is a request per message, to learn something the message
 * already told us.
 *
 * The fallback still invalidates, for the one case the cache cannot answer: a
 * message from a chat that is not in the list, which means the viewer was added
 * to it while this tab was open.
 */
export function applyChatActivity(queryClient: QueryClient, message: MessageDto): void {
  let known = false;

  queryClient.setQueryData<ChatListItemDto[]>(chatsQueryKey, (chats) => {
    if (!chats) return chats;

    const next = chats.map((chat) => {
      if (chat.id !== message.chatId) return chat;
      known = true;
      return { ...chat, lastMessage: message, lastMessageAt: message.createdAt };
    });

    return known ? next.sort(byRecency) : chats;
  });

  // Only refetches if something is actually watching the list; an invalidate of
  // an unobserved query just marks it stale.
  if (!known) void queryClient.invalidateQueries({ queryKey: chatsQueryKey });
}

/** Keeps the sidebar preview honest when the message it was showing is deleted. */
export function applyChatTombstone(queryClient: QueryClient, tombstone: MessageDto): void {
  queryClient.setQueryData<ChatListItemDto[]>(chatsQueryKey, (chats) =>
    chats?.map((chat) =>
      chat.lastMessage?.id === tombstone.id ? { ...chat, lastMessage: tombstone } : chat
    )
  );
}

/**
 * The sidebar list.
 *
 * No `staleTime`: the socket keeps this current while the tab is open, and a
 * refetch on focus covers whatever was missed while it was not.
 */
export function useChats() {
  return useQuery({
    queryKey: chatsQueryKey,
    queryFn: async () => (await api.get<ChatListItemDto[]>('/chats')).data,
  });
}

export function useChat(chatId: string) {
  return useQuery({
    queryKey: chatQueryKey(chatId),
    queryFn: async () => (await api.get<ChatListItemDto>(`/chats/${chatId}`)).data,
    // A 404 here is the API's answer for "not yours or not there" — both are
    // final, and retrying either just delays the error the screen needs to show.
    retry: false,
  });
}

/**
 * Creates a chat, or — for a direct one that already exists — returns the
 * existing chat, which is why the caller navigates to `data.id` rather than
 * assuming a new row.
 */
export function useCreateChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateChatPayload) => (await api.post<ChatDto>('/chats', input)).data,
    onSuccess: (chat) => {
      // The server already puts every connected member into the new chat's
      // room. This covers the one case it cannot: a direct chat that turned out
      // to already exist, where nothing was created and so nothing was joined —
      // the creator may have been added to it while their socket was down. The
      // server re-checks membership, so asking for a room already joined is
      // free and asking for one that is not theirs does nothing.
      getSocket().emit('chat:join', chat.id);
      void queryClient.invalidateQueries({ queryKey: chatsQueryKey });
    },
  });
}
