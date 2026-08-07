'use client';

import type {
  ChatListItemDto,
  ChatDto,
  CreateChatPayload,
  MarkReadResultDto,
  MessageDto,
  ReadReceipt,
} from '@repo/shared';
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
 *
 * `unread` is decided by the caller, not here — see `RealtimeBridge`. It is the
 * only place that knows which conversation is on screen, and a message arriving
 * in the one the reader is looking at must not raise a badge they would have to
 * dismiss by reading what they are already reading.
 */
export function applyChatActivity(
  queryClient: QueryClient,
  message: MessageDto,
  unread = false
): void {
  let known = false;

  queryClient.setQueryData<ChatListItemDto[]>(chatsQueryKey, (chats) => {
    if (!chats) return chats;

    const next = chats.map((chat) => {
      if (chat.id !== message.chatId) return chat;
      known = true;
      return {
        ...chat,
        lastMessage: message,
        lastMessageAt: message.createdAt,
        unreadCount: unread ? chat.unreadCount + 1 : chat.unreadCount,
      };
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
 * Moves one member's read watermark forward in a single chat.
 *
 * Timestamps are compared as strings throughout. Every one of them was produced
 * by `Date.prototype.toISOString()` on the API, so they share a fixed-width UTC
 * format in which lexical order *is* chronological order — and comparing them
 * this way costs no `Date` allocation per message per render.
 */
function withReceipt(
  chat: ChatListItemDto,
  receipt: ReadReceipt,
  viewerId: string
): ChatListItemDto {
  const index = chat.members.findIndex((member) => member.user.id === receipt.userId);
  if (index === -1) return chat;

  const member = chat.members[index]!;

  // Forward only. Two settles can cross on the wire, and a watermark that went
  // backwards would un-read messages that are on screen with their ticks
  // already drawn.
  if (member.lastReadAt !== null && member.lastReadAt >= receipt.readAt) return chat;

  const members = chat.members.map((existing, at) =>
    at === index ? { ...existing, lastReadAt: receipt.readAt } : existing
  );

  /*
   * Reading your own conversation to the end is the one case a client can
   * settle without asking: if your line has reached the newest message the
   * server told us about, there is nothing left unread. This is what clears the
   * badge in a second tab showing the sidebar while you read in the first.
   *
   * Short of the end the exact count belongs to whoever made the call — it is
   * in that response, applied by `applyMarkRead` — so the badge is left as it
   * is rather than guessed at.
   */
  const caughtUp =
    receipt.userId === viewerId &&
    chat.lastMessage !== null &&
    chat.lastMessage.createdAt <= receipt.readAt;

  return { ...chat, members, ...(caughtUp ? { unreadCount: 0 } : {}) };
}

/** Applies a `receipt:read` from the socket to both the list and the open chat. */
export function applyReadReceipt(
  queryClient: QueryClient,
  receipt: ReadReceipt,
  viewerId: string
): void {
  queryClient.setQueryData<ChatListItemDto[]>(chatsQueryKey, (chats) =>
    chats?.map((chat) => (chat.id === receipt.chatId ? withReceipt(chat, receipt, viewerId) : chat))
  );

  // The open conversation holds its own copy of the member list, and it is the
  // one the tick marks are drawn from.
  queryClient.setQueryData<ChatListItemDto>(chatQueryKey(receipt.chatId), (chat) =>
    chat ? withReceipt(chat, receipt, viewerId) : chat
  );
}

/**
 * Applies this tab's own `markRead` response.
 *
 * The watermark half is the same as a socket receipt — the server echoes one to
 * this tab too, and whichever lands first makes the other a no-op. The count is
 * not: only the server can know about messages that were written while this
 * page was scrolling, so its number replaces whatever the local rules produced.
 */
export function applyMarkRead(
  queryClient: QueryClient,
  result: MarkReadResultDto,
  viewerId: string
): void {
  applyReadReceipt(
    queryClient,
    { chatId: result.chatId, userId: viewerId, readAt: result.readAt },
    viewerId
  );

  queryClient.setQueryData<ChatListItemDto[]>(chatsQueryKey, (chats) =>
    chats?.map((chat) =>
      chat.id === result.chatId ? { ...chat, unreadCount: result.unreadCount } : chat
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
