'use client';

import type {
  AddMemberInput,
  ChatListItemDto,
  ChatDto,
  ChatMemberDto,
  CreateChatPayload,
  MarkReadResultDto,
  MessageDto,
  ReadReceipt,
  UpdateChatInput,
  UpdateMemberInput,
} from '@repo/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export const chatsQueryKey = ['chats'] as const;
/** Active and archived are two lists, so they are two cache entries. */
export const chatsListKey = (archived: boolean) => ['chats', { archived }] as const;
export const chatQueryKey = (chatId: string) => ['chats', chatId] as const;

function byRecency(a: ChatListItemDto, b: ChatListItemDto): number {
  if (a.lastMessageAt !== b.lastMessageAt) {
    if (!a.lastMessageAt) return 1;
    if (!b.lastMessageAt) return -1;
    return a.lastMessageAt < b.lastMessageAt ? 1 : -1;
  }
  return a.createdAt < b.createdAt ? 1 : -1;
}

export function applyChatActivity(
  queryClient: QueryClient,
  message: MessageDto,
  unread = false
): void {
  let known = false;

  queryClient.setQueryData<ChatListItemDto[]>(chatsListKey(false), (chats) => {
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

  if (!known) void queryClient.invalidateQueries({ queryKey: chatsQueryKey });
}

export function refreshChatPreview(queryClient: QueryClient, message: MessageDto): void {
  queryClient.setQueryData<ChatListItemDto[]>(chatsListKey(false), (chats) =>
    chats?.map((chat) =>
      chat.lastMessage?.id === message.id ? { ...chat, lastMessage: message } : chat
    )
  );
}

export function applyChatUpdate(queryClient: QueryClient, chatId: string): void {
  void queryClient.invalidateQueries({ queryKey: chatQueryKey(chatId) });
  void queryClient.invalidateQueries({ queryKey: chatsQueryKey });
}

function withReceipt(
  chat: ChatListItemDto,
  receipt: ReadReceipt,
  viewerId: string
): ChatListItemDto {
  const index = chat.members.findIndex((member) => member.user.id === receipt.userId);
  if (index === -1) return chat;

  const member = chat.members[index]!;

  if (member.lastReadAt !== null && member.lastReadAt >= receipt.readAt) return chat;

  const members = chat.members.map((existing, at) =>
    at === index ? { ...existing, lastReadAt: receipt.readAt } : existing
  );

  const caughtUp =
    receipt.userId === viewerId &&
    chat.lastMessage !== null &&
    chat.lastMessage.createdAt <= receipt.readAt;

  return { ...chat, members, ...(caughtUp ? { unreadCount: 0 } : {}) };
}

export function applyReadReceipt(
  queryClient: QueryClient,
  receipt: ReadReceipt,
  viewerId: string
): void {
  queryClient.setQueryData<ChatListItemDto[]>(chatsListKey(false), (chats) =>
    chats?.map((chat) => (chat.id === receipt.chatId ? withReceipt(chat, receipt, viewerId) : chat))
  );

  queryClient.setQueryData<ChatListItemDto>(chatQueryKey(receipt.chatId), (chat) =>
    chat ? withReceipt(chat, receipt, viewerId) : chat
  );
}

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

  queryClient.setQueryData<ChatListItemDto[]>(chatsListKey(false), (chats) =>
    chats?.map((chat) =>
      chat.id === result.chatId ? { ...chat, unreadCount: result.unreadCount } : chat
    )
  );
}

export function useChats(archived = false) {
  return useQuery({
    queryKey: chatsListKey(archived),
    queryFn: async () =>
      (await api.get<ChatListItemDto[]>('/chats', { params: { archived } })).data,
  });
}

export function useChat(chatId: string) {
  return useQuery({
    queryKey: chatQueryKey(chatId),
    queryFn: async () => (await api.get<ChatListItemDto>(`/chats/${chatId}`)).data,
    retry: false,
  });
}

export function useCreateChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateChatPayload) => (await api.post<ChatDto>('/chats', input)).data,
    onSuccess: (chat) => {
      getSocket().emit('chat:join', chat.id);
      void queryClient.invalidateQueries({ queryKey: chatsQueryKey });
    },
  });
}

export function useUpdateChat(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateChatInput) =>
      (await api.patch<ChatDto>(`/chats/${chatId}`, input)).data,
    onSuccess: () => applyChatUpdate(queryClient, chatId),
  });
}

export function useDeleteChat(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.delete(`/chats/${chatId}`);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: chatQueryKey(chatId) });
      void queryClient.invalidateQueries({ queryKey: chatsQueryKey });
    },
  });
}

export function useUpdateMember(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, ...input }: UpdateMemberInput & { userId: string }) =>
      (await api.patch<ChatMemberDto>(`/chats/${chatId}/members/${userId}`, input)).data,
    onSuccess: () => applyChatUpdate(queryClient, chatId),
  });
}

export function useAddMember(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddMemberInput) =>
      (await api.post<ChatMemberDto>(`/chats/${chatId}/members`, input)).data,
    onSuccess: () => applyChatUpdate(queryClient, chatId),
  });
}

export function useRemoveMember(chatId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/chats/${chatId}/members/${userId}`);
    },
    onSuccess: () => applyChatUpdate(queryClient, chatId),
  });
}
