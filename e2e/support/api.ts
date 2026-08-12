import type {
  ChatDto,
  ChatListItemDto,
  ChatMemberDto,
  ChatRole,
  ChatType,
  MarkReadResultDto,
  MessageDto,
  UserDto,
} from '@repo/shared';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { Account } from './db';
import { API_URL } from './env';

/**
 * The REST API, as the suite uses it to *arrange* a situation.
 *
 * Every method here runs on an `APIRequestContext` taken from a browser
 * context, which means it shares that context's cookie jar. Signing in through
 * this class leaves the page signed in too — no storage-state file to keep in
 * step, no second login through the form on every test that is not about the
 * form.
 *
 * Arranging over HTTP rather than in SQL, unlike `db.ts`: a chat is not one row
 * but a chat, its membership rows and a `lastMessageAt`, and reproducing that
 * by hand would be reproducing `ChatService`. Where the shape is not the point
 * of the test, letting the server build it is both shorter and more honest.
 */
export class Api {
  constructor(private readonly request: APIRequestContext) {}

  // --- Auth ------------------------------------------------------------------

  /** Signs in, leaving all three cookies in the shared jar. */
  async login(account: Account): Promise<UserDto> {
    return this.json(
      await this.request.post(`${API_URL}/api/auth/login`, {
        data: { universityId: account.universityId, password: account.password },
      }),
      'login'
    );
  }

  async logout(): Promise<void> {
    // `data: {}` and not a bodyless post: the CSRF guard treats a request with
    // no `Content-Type` as `text/plain` and refuses it, because that shape is
    // one a hostile page could send cross-origin without a preflight.
    await this.expectOk(
      await this.request.post(`${API_URL}/api/auth/logout`, { data: {} }),
      'logout'
    );
  }

  async me(): Promise<UserDto> {
    return this.json(await this.request.get(`${API_URL}/api/auth/me`), 'me');
  }

  // --- Chats -----------------------------------------------------------------

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
    patch: { title?: string; isReadOnly?: boolean }
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

  // --- Messages ---------------------------------------------------------------

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

  // --- Raw ---------------------------------------------------------------------

  /**
   * An unchecked request, for the tests that are *about* being refused.
   *
   * Everything else throws on a non-2xx, which is what makes an arrangement
   * failure surface at the line that caused it instead of three assertions
   * later.
   */
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
