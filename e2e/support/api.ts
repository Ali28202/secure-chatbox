import type {
  ChatDto,
  ChatListItemDto,
  ChatMemberDto,
  ChatRole,
  ChatType,
  MarkReadResultDto,
  MessageDto,
  MessageSearchResultsDto,
  SessionsDto,
  UserDto,
} from '@repo/shared';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { Account } from './db';
import { API_URL } from './env';

export function deviceIdFor(account: Account, label = 'default'): string {
  return `e2e-${label}-${account.universityId}`.padEnd(20, '0');
}

export class Api {
  constructor(private readonly request: APIRequestContext) {}

  async login(account: Account, deviceId = deviceIdFor(account)): Promise<UserDto> {
    return this.json(
      await this.request.post(`${API_URL}/api/auth/login`, {
        data: { identifier: account.universityId, password: account.password, deviceId },
      }),
      'login'
    );
  }

  async logout(): Promise<void> {
    await this.expectOk(
      await this.request.post(`${API_URL}/api/auth/logout`, { data: {} }),
      'logout'
    );
  }

  async me(): Promise<UserDto> {
    return this.json(await this.request.get(`${API_URL}/api/auth/me`), 'me');
  }

  async listChats(): Promise<ChatListItemDto[]> {
    return this.json(await this.request.get(`${API_URL}/api/chats`), 'list chats');
  }

  async createDirectChat(memberId: string): Promise<ChatDto> {
    return this.json(
      await this.request.post(`${API_URL}/api/chats`, {
        data: { type: 'DIRECT', memberId },
      }),
      'create direct chat'
    );
  }

  async createGroup(
    type: Exclude<ChatType, 'DIRECT'>,
    title: string,
    memberIds: string[] = []
  ): Promise<ChatDto> {
    return this.json(
      await this.request.post(`${API_URL}/api/chats`, { data: { type, title, memberIds } }),
      'create group'
    );
  }

  async updateChat(
    chatId: string,
    patch: { title?: string; isReadOnly?: boolean; isArchived?: boolean }
  ): Promise<ChatDto> {
    return this.json(
      await this.request.patch(`${API_URL}/api/chats/${chatId}`, { data: patch }),
      'update chat'
    );
  }

  async addMember(
    chatId: string,
    userId: string,
    role: ChatRole = 'MEMBER'
  ): Promise<ChatMemberDto> {
    return this.json(
      await this.request.post(`${API_URL}/api/chats/${chatId}/members`, { data: { userId, role } }),
      'add member'
    );
  }

  async updateMember(
    chatId: string,
    userId: string,
    patch: { role?: ChatRole; isMuted?: boolean }
  ): Promise<ChatMemberDto> {
    return this.json(
      await this.request.patch(`${API_URL}/api/chats/${chatId}/members/${userId}`, { data: patch }),
      'update member'
    );
  }

  async search(q: string): Promise<MessageSearchResultsDto> {
    return this.json(
      await this.request.get(`${API_URL}/api/search`, { params: { q } }),
      'search messages'
    );
  }

  async listSessions(): Promise<SessionsDto> {
    return this.json(await this.request.get(`${API_URL}/api/auth/sessions`), 'list sessions');
  }

  async toggleReaction(chatId: string, messageId: string, emoji: string): Promise<MessageDto> {
    return this.json(
      await this.request.put(`${API_URL}/api/chats/${chatId}/messages/${messageId}/reactions`, {
        data: { emoji },
      }),
      'toggle reaction'
    );
  }

  async sendMessage(chatId: string, content: string, replyToId?: string): Promise<MessageDto> {
    return this.json(
      await this.request.post(`${API_URL}/api/chats/${chatId}/messages`, {
        data: replyToId ? { content, replyToId } : { content },
      }),
      'send message'
    );
  }

  async markRead(chatId: string, upToMessageId: string): Promise<MarkReadResultDto> {
    return this.json(
      await this.request.post(`${API_URL}/api/chats/${chatId}/messages/read`, {
        data: { upToMessageId },
      }),
      'mark read'
    );
  }

  async setPinned(chatId: string, messageId: string, isPinned: boolean): Promise<MessageDto> {
    return this.json(
      await this.request.patch(`${API_URL}/api/chats/${chatId}/messages/${messageId}/pin`, {
        data: { isPinned },
      }),
      'pin message'
    );
  }

  raw(): APIRequestContext {
    return this.request;
  }

  private async json<T>(response: APIResponse, what: string): Promise<T> {
    await this.expectOk(response, what);
    return (await response.json()) as T;
  }

  private async expectOk(response: APIResponse, what: string): Promise<void> {
    if (response.ok()) return;
    throw new Error(
      `Arranging "${what}" failed: ${response.status()} ${response.statusText()}\n` +
        (await response.text())
    );
  }
}
