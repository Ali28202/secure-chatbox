'use client';

import type {
  MarkReadResultDto,
  MessageDto,
  MessagePageDto,
  PinnedMessagesDto,
  SendMessageInput,
} from '@repo/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { applyChatActivity, applyMarkRead, refreshChatPreview } from './use-chats';

export const messagesQueryKey = (chatId: string) => ['messages', chatId] as const;

export const messagesRootKey = ['messages'] as const;

export const pinnedQueryKey = (chatId: string) => ['pinned', chatId] as const;

type MessagesCache = { pages: MessagePageDto[]; pageParams: (string | null)[] };

export interface SendMessagePayload {
  content?: string;
  replyToId?: string;
  files?: File[];
}

function withMessage(
  cache: MessagesCache | undefined,
  message: MessageDto
): MessagesCache | undefined {
  if (!cache) return cache;

  const [newest, ...rest] = cache.pages;
  if (!newest || newest.messages.some((existing) => existing.id === message.id)) return cache;

  return { ...cache, pages: [{ ...newest, messages: [message, ...newest.messages] }, ...rest] };
}

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
          : message.replyTo?.id === tombstone.id
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
  refreshChatPreview(queryClient, tombstone);

  void queryClient.invalidateQueries({ queryKey: pinnedQueryKey(tombstone.chatId) });
}

export function applyUpdatedMessage(queryClient: QueryClient, message: MessageDto): void {
  queryClient.setQueryData<MessagesCache>(messagesQueryKey(message.chatId), (cache) =>
    cache
      ? {
          ...cache,
          pages: cache.pages.map((page) => ({
            ...page,
            messages: page.messages.map((existing) =>
              existing.id === message.id ? message : existing
            ),
          })),
        }
      : cache
  );
  refreshChatPreview(queryClient, message);
  void queryClient.invalidateQueries({ queryKey: pinnedQueryKey(message.chatId) });
}

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
    retry: false,
  });
}

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
      if (content) form.append('content', content);
      if (replyToId) form.append('replyToId', replyToId);
      for (const file of files) form.append('files', file);

      return (
        await api.post<MessageDto>(path, form, {
          headers: { 'Content-Type': null },
        })
      ).data;
    },
    onSuccess: (message) => applyIncomingMessage(queryClient, message),
  });
}

export function useDeleteMessage(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) =>
      (await api.delete<MessageDto>(`/chats/${chatId}/messages/${messageId}`)).data,
    onSuccess: (tombstone) => applyDeletedMessage(queryClient, tombstone),
  });
}

export function usePinnedMessages(chatId: string) {
  return useQuery({
    queryKey: pinnedQueryKey(chatId),
    queryFn: async () =>
      (await api.get<PinnedMessagesDto>(`/chats/${chatId}/messages/pinned`)).data.messages,
    retry: false,
  });
}

export function useSetPinned(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, isPinned }: { messageId: string; isPinned: boolean }) =>
      (await api.patch<MessageDto>(`/chats/${chatId}/messages/${messageId}/pin`, { isPinned }))
        .data,
    onSuccess: (message) => applyUpdatedMessage(queryClient, message),
  });
}

export function useMarkRead(chatId: string, viewerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (upToMessageId: string) =>
      (await api.post<MarkReadResultDto>(`/chats/${chatId}/messages/read`, { upToMessageId })).data,
    onSuccess: (result) => applyMarkRead(queryClient, result, viewerId),
  });
}
