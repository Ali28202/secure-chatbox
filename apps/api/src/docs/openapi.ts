import { COOKIE_NAMES, FILE_ACCEPT, REFRESH_COOKIE_PATH, UPLOAD } from '@repo/shared';
import { isProduction } from '../env';
import { buildComponentSchemas, queryParameters, ref, type SchemaName } from './schemas';

type Content = Record<string, unknown>;

const json = (description: string, schema: SchemaName | { $ref: string }): Content => ({
  description,
  content: {
    'application/json': { schema: typeof schema === 'string' ? ref(schema) : schema },
  },
});

const jsonArray = (description: string, schema: SchemaName): Content => ({
  description,
  content: { 'application/json': { schema: { type: 'array', items: ref(schema) } } },
});

const error = (description: string): Content => ({
  description,
  content: { 'application/json': { schema: ref('ApiError') } },
});

const AUTH_ERRORS = {
  401: error(
    'No access token, or one that no longer verifies. `code` is `DEVICE_MISMATCH` when the account has since signed in elsewhere — refreshing will fail for the same reason, and the client should send the user back to the login page rather than retry.'
  ),
} as const;

const VALIDATION_ERROR = {
  422: error('The body or query failed validation. `details` names each offending field.'),
} as const;

const CHAT_SCOPE_ERRORS = {
  ...AUTH_ERRORS,
  404: error(
    'No such chat, or the caller is not a member of it. The two are deliberately indistinguishable — membership is part of the lookup, so probing ids tells an outsider nothing.'
  ),
} as const;

const pathParam = (name: string, description: string) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', format: 'uuid' },
});

const CHAT_ID_PARAM = pathParam('chatId', 'The conversation.');
const MESSAGE_ID_PARAM = pathParam('messageId', 'A message in this conversation.');

const PAGINATION_PARAMS = queryParameters('ListMessagesQuery', {
  before: 'Cursor: return the page of messages older than this id. Omit for the newest page.',
  limit: 'How many messages to return.',
});

const USER_SEARCH_PARAMS = queryParameters('UserSearchQuery', {
  search: 'Matches name or university id. Omit to list the directory.',
  limit: 'Maximum number of results.',
});

const paths: Record<string, Record<string, unknown>> = {
  '/': {
    get: {
      tags: ['Health'],
      operationId: 'getServiceInfo',
      summary: 'Service banner',
      description: 'Answers as long as the process is up. Outside `/api`, and unauthenticated.',
      security: [],
      responses: { 200: json('The service is running.', 'ServiceInfo') },
    },
  },

  '/api/health': {
    get: {
      tags: ['Health'],
      operationId: 'getHealth',
      summary: 'Liveness',
      description: 'The process is up. Says nothing about the database.',
      security: [],
      responses: { 200: json('The process is alive.', 'HealthStatus') },
    },
  },

  '/api/health/db': {
    get: {
      tags: ['Health'],
      operationId: 'getDatabaseHealth',
      summary: 'Readiness',
      description: 'The database is reachable and migrated.',
      security: [],
      responses: {
        200: json('The database answered.', 'HealthDbStatus'),
        503: error(
          'The database is unreachable. A 503 rather than a 500 on purpose: the service is fine, its dependency is not, and orchestrators treat the two differently.'
        ),
      },
    },
  },

  '/api/auth/register': {
    post: {
      tags: ['Auth'],
      operationId: 'register',
      summary: 'Create an account',
      description:
        'Creates the account but does **not** sign the user in — call `/api/auth/login` afterwards. Registration and authentication stay separate so the one endpoint that hands out sessions is the one that checks a password.',
      security: [],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref('RegisterRequest') } },
      },
      responses: {
        201: json('The account was created.', 'UserDto'),
        409: error('The university id or phone number is already registered.'),
        ...VALIDATION_ERROR,
      },
    },
  },

  '/api/auth/login': {
    post: {
      tags: ['Auth'],
      operationId: 'login',
      summary: 'Sign in',
      description: `Sets three httpOnly cookies and returns the account.

- \`${COOKIE_NAMES.access}\` — short-lived, scoped to \`/\`, and what authenticates every other request here.
- \`${COOKIE_NAMES.refresh}\` — long-lived, scoped to \`${REFRESH_COOKIE_PATH}\` so it only travels to the routes that can redeem it.
- \`${COOKIE_NAMES.sessionHint}\` — carries no token; it exists so the web client can tell "signed out" from "access token expired, refresh still good".

An account holds **one device at a time**. Signing in here revokes the previous device's tokens and disconnects any socket it still had open.`,
      security: [],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref('LoginRequest') } },
      },
      responses: {
        200: {
          ...json('Signed in.', 'UserDto'),
          headers: {
            'Set-Cookie': {
              description: 'The three session cookies described above.',
              schema: { type: 'string' },
            },
          },
        },
        401: error(
          'The identifier or password is wrong. The same answer for both, and it takes the same time either way, so neither can be used to discover which accounts exist.'
        ),
        403: error('The account has been disabled by an administrator.'),
        ...VALIDATION_ERROR,
      },
    },
  },

  '/api/auth/refresh': {
    post: {
      tags: ['Auth'],
      operationId: 'refreshSession',
      summary: 'Rotate the session',
      description:
        'Redeems the refresh cookie for a fresh pair. Every failure clears all three cookies: refresh is what an expired access token falls back to, so if this fails there is nothing left to try.',
      security: [{ refreshCookie: [] }],
      responses: {
        200: json('A new pair of tokens was issued.', 'UserDto'),
        401: error('The refresh cookie is missing, expired, or bound to another device.'),
      },
    },
  },

  '/api/auth/logout': {
    post: {
      tags: ['Auth'],
      operationId: 'logout',
      summary: 'Sign out',
      description:
        'Clears the cookies, which is the whole of logout. Refresh tokens are stateless by design, so one already copied out of the browser stays valid until it expires; the mitigation is the short access-token TTL and rotation on every refresh.',
      security: [],
      responses: { 200: json('The cookies were cleared.', 'SuccessResult') },
    },
  },

  '/api/auth/me': {
    get: {
      tags: ['Auth'],
      operationId: 'getCurrentUser',
      summary: 'The signed-in account',
      responses: {
        200: json('The current user.', 'UserDto'),
        ...AUTH_ERRORS,
      },
    },
  },

  '/api/users': {
    get: {
      tags: ['Users'],
      operationId: 'searchUsers',
      summary: 'Search the member directory',
      description:
        'The people picker behind "گفت‌وگوی جدید". `search` is optional — an empty field still lists someone, because a directory that shows nothing until you type gives no hint that it works. Behind authentication because the member list of a private university network is not public information.',
      parameters: USER_SEARCH_PARAMS,
      responses: {
        200: jsonArray('Matching accounts, excluding the caller.', 'UserSummaryDto'),
        ...AUTH_ERRORS,
        ...VALIDATION_ERROR,
      },
    },
  },

  '/api/chats': {
    get: {
      tags: ['Chats'],
      operationId: 'listChats',
      summary: 'The caller’s conversations',
      description:
        'Everything the sidebar needs in one call: members, the last message, and an unread count per chat.',
      responses: {
        200: jsonArray('Conversations, most recently active first.', 'ChatListItemDto'),
        ...AUTH_ERRORS,
      },
    },
    post: {
      tags: ['Chats'],
      operationId: 'createChat',
      summary: 'Start a conversation',
      description:
        'The body is discriminated on `type`. A `DIRECT` chat names one other member and is unique per pair — asking for one that exists returns the existing chat. `COURSE_GROUP` is restricted to professors; custom groups and direct chats are open to everyone.',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref('CreateChatRequest') } },
      },
      responses: {
        201: json('The conversation.', 'ChatDto'),
        403: error('Only a professor may create a course group.'),
        404: error('One of the named members does not exist.'),
        ...AUTH_ERRORS,
        ...VALIDATION_ERROR,
      },
    },
  },

  '/api/chats/{chatId}': {
    get: {
      tags: ['Chats'],
      operationId: 'getChat',
      summary: 'One conversation',
      parameters: [CHAT_ID_PARAM],
      responses: {
        200: json('The conversation, in the same shape as the list.', 'ChatListItemDto'),
        ...CHAT_SCOPE_ERRORS,
      },
    },
    patch: {
      tags: ['Chats'],
      operationId: 'updateChat',
      summary: 'Rename, or flip read-only',
      description:
        'Admin-only, and never for a direct chat — the two people in one are peers, and there is nothing there to administer.',
      parameters: [CHAT_ID_PARAM],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref('UpdateChatRequest') } },
      },
      responses: {
        200: json('The updated conversation.', 'ChatDto'),
        403: error('The caller is not an admin of this chat, or the chat is direct.'),
        ...CHAT_SCOPE_ERRORS,
        ...VALIDATION_ERROR,
      },
    },
  },

  '/api/chats/{chatId}/members': {
    post: {
      tags: ['Chats'],
      operationId: 'addChatMember',
      summary: 'Add a member',
      parameters: [CHAT_ID_PARAM],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref('AddMemberRequest') } },
      },
      responses: {
        201: json('The new membership.', 'ChatMemberDto'),
        403: error('The caller is not an admin, or the chat is direct and its pair is fixed.'),
        404: error('No such chat for this caller, or no such user.'),
        409: error('That user is already a member.'),
        ...AUTH_ERRORS,
        ...VALIDATION_ERROR,
      },
    },
  },

  '/api/chats/{chatId}/members/{userId}': {
    patch: {
      tags: ['Chats'],
      operationId: 'updateChatMember',
      summary: 'Promote, demote, mute or unmute',
      description:
        'One endpoint, because from the caller’s side they are the same thing: editing one row of the member list. Handing over `ADMIN` here is also how the last admin becomes able to leave.',
      parameters: [CHAT_ID_PARAM, pathParam('userId', 'The member being edited.')],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref('UpdateMemberRequest') } },
      },
      responses: {
        200: json('The updated membership.', 'ChatMemberDto'),
        403: error('The caller is not an admin, the chat is direct, or the target is an admin.'),
        404: error('No such chat for this caller, or that user is not a member.'),
        ...AUTH_ERRORS,
        ...VALIDATION_ERROR,
      },
    },
    delete: {
      tags: ['Chats'],
      operationId: 'removeChatMember',
      summary: 'Remove a member, or leave',
      description:
        'Removing yourself is leaving; removing anyone else is an admin action. Refused for the last remaining admin — hand `ADMIN` to someone else first.',
      parameters: [CHAT_ID_PARAM, pathParam('userId', 'The member being removed.')],
      responses: {
        200: json('The member was removed.', 'SuccessResult'),
        403: error('Not permitted, or the caller is the last admin of the chat.'),
        404: error('No such chat for this caller, or that user is not a member.'),
        ...AUTH_ERRORS,
      },
    },
  },

  '/api/chats/{chatId}/messages': {
    get: {
      tags: ['Messages'],
      operationId: 'listMessages',
      summary: 'Read a page of messages',
      description:
        'Cursor pagination, newest first. There is no chat id in the body or query anywhere under this prefix: the only conversation these endpoints can reach is the one the caller has already been admitted to.',
      parameters: [CHAT_ID_PARAM, ...PAGINATION_PARAMS],
      responses: {
        200: json('A page of messages.', 'MessagePageDto'),
        ...CHAT_SCOPE_ERRORS,
        ...VALIDATION_ERROR,
      },
    },
    post: {
      tags: ['Messages'],
      operationId: 'sendMessage',
      summary: 'Send a message',
      description: `One endpoint, two encodings — whether a message carries a photo is a property of how it was encoded, not of what it is.

Send \`application/json\` for a plain message, or \`multipart/form-data\` when there are files. In the multipart form, \`content\` becomes optional (a photo needs no caption) and every part named \`files\` is kept.

At most ${UPLOAD.maxFilesPerMessage} files, ${UPLOAD.maxFileBytes / 1024 / 1024} MB each. Accepted types: \`${FILE_ACCEPT}\`.`,
      parameters: [CHAT_ID_PARAM],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: ref('SendMessageRequest') },
          'multipart/form-data': {
            schema: {
              allOf: [
                ref('UploadMessageFields'),
                {
                  type: 'object',
                  properties: {
                    files: {
                      type: 'array',
                      maxItems: UPLOAD.maxFilesPerMessage,
                      items: { type: 'string', format: 'binary' },
                    },
                  },
                },
              ],
            },
          },
        },
      },
      responses: {
        201: json('The stored message, with its attachments.', 'MessageDto'),
        403: error(
          'The chat is read-only, the caller is muted, or the caller is not permitted to post here.'
        ),
        404: error('No such chat for this caller, or the message being replied to is not in it.'),
        413: error(
          'The request, or one file in it, is over the limit. Answered before the body is read where `Content-Length` allows it, and again against the bytes that actually arrived.'
        ),
        ...AUTH_ERRORS,
        ...VALIDATION_ERROR,
      },
    },
  },

  '/api/chats/{chatId}/messages/read': {
    post: {
      tags: ['Messages'],
      operationId: 'markMessagesRead',
      summary: 'Mark read up to a message',
      description:
        'Advances this member’s read watermark. A watermark rather than a count, because counts do not survive the realtime path: two overlapping read ranges would each add their own total, while a watermark applied twice is the same watermark.',
      parameters: [CHAT_ID_PARAM],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref('MarkReadRequest') } },
      },
      responses: {
        200: json('The new watermark and the recomputed unread count.', 'MarkReadResultDto'),
        404: error('No such chat for this caller, or that message is not in it.'),
        ...AUTH_ERRORS,
        ...VALIDATION_ERROR,
      },
    },
  },

  '/api/chats/{chatId}/messages/pinned': {
    get: {
      tags: ['Messages'],
      operationId: 'listPinnedMessages',
      summary: 'The pinned messages',
      parameters: [CHAT_ID_PARAM],
      responses: {
        200: json('The pinned messages of this conversation.', 'PinnedMessagesDto'),
        ...CHAT_SCOPE_ERRORS,
      },
    },
  },

  '/api/chats/{chatId}/messages/{messageId}/pin': {
    patch: {
      tags: ['Messages'],
      operationId: 'setMessagePinned',
      summary: 'Pin or unpin',
      description:
        '`PATCH` with the desired state rather than `POST /pin` and `DELETE /pin`, so retrying is harmless and two admins acting at once agree. Admin-only.',
      parameters: [CHAT_ID_PARAM, MESSAGE_ID_PARAM],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref('PinMessageRequest') } },
      },
      responses: {
        200: json('The message, with its new pin state.', 'MessageDto'),
        403: error('Only an admin of the chat may pin messages.'),
        404: error('No such chat for this caller, or that message is not in it.'),
        ...AUTH_ERRORS,
        ...VALIDATION_ERROR,
      },
    },
  },

  '/api/chats/{chatId}/messages/{messageId}': {
    delete: {
      tags: ['Messages'],
      operationId: 'deleteMessage',
      summary: 'Delete a message',
      description:
        'A soft delete: the row survives so reply chains stay intact, with `content` nulled and `isDeleted` set. Answers with the tombstoned message rather than `204`, so the client can replace the row it already has instead of refetching the page to find out what changed.',
      parameters: [CHAT_ID_PARAM, MESSAGE_ID_PARAM],
      responses: {
        200: json('The tombstoned message.', 'MessageDto'),
        403: error('Only the sender or an admin of the chat may delete a message.'),
        404: error('No such chat for this caller, or that message is not in it.'),
        ...AUTH_ERRORS,
      },
    },
  },

  '/api/attachments/{attachmentId}': {
    get: {
      tags: ['Attachments'],
      operationId: 'downloadAttachment',
      summary: 'Download an attachment',
      description: `Answers **302** with a \`Location\` pointing at a URL signed for the next few minutes; the browser then fetches the bytes from the object store directly.

The bucket is private and stays private. Authorization happens on every single access — the membership check is part of the lookup, not a step after it — the API never becomes a byte pump for a semester of coursework, and a signed URL that escapes into a ticket or a browser history is worthless by the time anyone tries it.

The redirect is sent with \`Cache-Control: no-store\`: a cached one would outlive its signature and serve a dead link to the one person allowed a live one.`,
      parameters: [pathParam('attachmentId', 'The attachment.')],
      responses: {
        302: {
          description: 'Redirect to a short-lived signed URL.',
          headers: {
            Location: { description: 'The signed URL.', schema: { type: 'string', format: 'uri' } },
            'Cache-Control': { schema: { type: 'string', example: 'no-store' } },
          },
        },
        404: error(
          'No such attachment, or it belongs to a conversation the caller is not in, or its message was deleted. All three answer identically.'
        ),
        ...AUTH_ERRORS,
      },
    },
  },
};

if (!isProduction) {
  paths['/api/health/echo'] = {
    post: {
      tags: ['Health'],
      operationId: 'echo',
      summary: 'Echo (development only)',
      description:
        'Exercises the whole request path — validator, error envelope, Persian messages — without needing a real feature to exist. Not mounted in production.',
      security: [],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: ref('EchoRequest') } },
      },
      responses: {
        200: json('The message, repeated.', 'EchoResult'),
        ...VALIDATION_ERROR,
      },
    },
  };
}

export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Secure Chatbox API',
      version: '1.0.0',
      description: `The HTTP surface of Secure Chatbox — a messaging platform for a university intranet.

**Authentication is by cookie.** \`POST /api/auth/login\` sets an httpOnly \`${COOKIE_NAMES.access}\`, and the browser sends it with every subsequent request; there is no bearer token to paste. If you are signed in to the web client on this origin, the *Test Request* button below will work as you are.`,
    },
    servers: [{ url: '/', description: 'This server' }],
    tags: [
      { name: 'Auth', description: 'Sessions, and the cookies that carry them.' },
      { name: 'Users', description: 'The member directory.' },
      { name: 'Chats', description: 'Conversations and their membership.' },
      { name: 'Messages', description: 'Sending, reading, pinning and deleting.' },
      { name: 'Attachments', description: 'Downloads, and nothing else.' },
      { name: 'Health', description: 'Liveness and readiness probes.' },
    ],
    security: [{ accessCookie: [] }],
    paths,
    components: {
      securitySchemes: {
        accessCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: COOKIE_NAMES.access,
          description:
            'Set by `POST /api/auth/login`. httpOnly, so no script can read or forge it — including this page, which relies on the browser sending it automatically.',
        },
        refreshCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: COOKIE_NAMES.refresh,
          description: `Also set by login, but scoped to \`${REFRESH_COOKIE_PATH}\` — the browser never sends it anywhere else.`,
        },
      },
      schemas: buildComponentSchemas(),
    },
  };
}

interface RegisteredRoute {
  path: string;
  method: string;
}

export function undocumentedRoutes(routes: readonly RegisteredRoute[]): string[] {
  const documented = new Set(
    Object.entries(paths).flatMap(([path, operations]) =>
      Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`)
    )
  );

  const missing = routes
    .filter((route) => route.method !== 'ALL' && !route.path.startsWith(DOCS_PATH))
    .map((route) => `${route.method} ${route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`)
    .filter((route) => !documented.has(route));

  return [...new Set(missing)].sort();
}

export const DOCS_PATH = '/api/docs';
