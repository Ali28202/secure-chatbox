'use client';

import type { ChatDto, ChatListItemDto, CreateChatPayload } from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const chatsQueryKey = ['chats'] as const;
export const chatQueryKey = (chatId: string) => ['chats', chatId] as const;

/**
 * The sidebar list.
 *
 * No `staleTime`: until M8's socket pushes updates, a refetch when the window
 * regains focus is the only way a second tab learns about a new conversation.
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chatsQueryKey }),
  });
}
