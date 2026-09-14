import {
  CHAT_ROLES,
  CHAT_TYPES,
  ERROR_CODES,
  ACCOUNT_STATUSES,
  GLOBAL_ROLES,
  SYSTEM_EVENTS,
  addMemberSchema,
  createChatSchema,
  listChatsQuerySchema,
  searchMessagesQuerySchema,
  listMessagesQuerySchema,
  loginSchema,
  markReadSchema,
  pinMessageSchema,
  toggleReactionSchema,
  registerSchema,
  sendMessageSchema,
  updateChatSchema,
  updateMemberSchema,
  uploadMessageSchema,
  adminUpdateUserSchema,
  adminUserQuerySchema,
  userSearchSchema,
  type ApiErrorBody,
  type AttachmentDto,
  type ChatDto,
  type ChatListItemDto,
  type ChatMemberDto,
  type FieldIssue,
  type MarkReadResultDto,
  type MessageDto,
  type MessageReactionDto,
  type MessageSearchHitDto,
  type MessageSearchResultsDto,
  type SessionDto,
  type SessionsDto,
  type AdminUserDto,
  type AdminUsersDto,
  type MessagePageDto,
  type MessageReplyDto,
  type PinnedMessagesDto,
  type UserDto,
  type UserSummaryDto,
} from '@repo/shared';
import * as z from 'zod';
import { echoSchema } from '../routes/health';

const uuid = (example: string) => z.string().meta({ format: 'uuid', example });

const dateTime = z.string().meta({ format: 'date-time', example: '2026-03-14T09:21:47.000Z' });

const CHAT_ID = '3f8a1c22-4b7e-4d1a-9c6f-1b2e5a7d9014';
const MESSAGE_ID = 'c1d4e77b-2a90-4f35-8e61-7d0b3a5c8f22';
const USER_ID = '9b2f6d10-58c3-4a7e-b1d9-6e4a0c3f5b88';

const userSummaryDto = z.object({
  id: uuid(USER_ID),
  name: z.string().meta({ example: 'علی محلاتی' }),
  universityId: z.string().meta({ example: '40012301' }),
  role: z.enum(GLOBAL_ROLES),
  hasAvatar: z.boolean().meta({
    description:
      'Whether `GET /api/users/{userId}/avatar` will redirect to an image. The object key is never exposed, and a signed URL would expire inside a cached response.',
  }),
});

const userDto = userSummaryDto.extend({
  phoneNumber: z
    .string()
    .meta({ example: '09351230001' })
    .nullable()
    .meta({ description: 'Null for accounts that predate the phone-number identifier.' }),
  status: z.enum(ACCOUNT_STATUSES).meta({
    description:
      'Registration is open, so an account starts as PENDING — a request, not access. Separate from `isActive`, which switches off an account that was already approved.',
  }),
  isActive: z.boolean(),
  lastSeen: dateTime.nullable(),
  createdAt: dateTime,
});

const chatMemberDto = z.object({
  user: userSummaryDto,
  role: z.enum(CHAT_ROLES),
  isMuted: z.boolean(),
  joinedAt: dateTime,
  lastReadAt: dateTime.nullable().meta({
    description:
      'Read watermark: the `createdAt` of the newest message this member has a READ receipt for. A message is read by them iff `lastReadAt >= createdAt`. Null when they have read nothing.',
  }),
});

const chatDto = z.object({
  id: uuid(CHAT_ID),
  type: z.enum(CHAT_TYPES),
  title: z
    .string()
    .meta({ example: 'مبانی برنامه‌نویسی — گروه ۲' })
    .nullable()
    .meta({ description: 'Null for direct chats, which are titled from the other member.' }),
  isReadOnly: z.boolean(),
  deletedAt: dateTime.nullable().meta({
    description:
      'Soft. Set means the conversation is gone from every read path, including its messages and attachments. The rows survive so it can be put back.',
  }),
  archivedAt: dateTime.nullable().meta({
    description:
      'When the conversation was retired. Non-null means nobody may post, admins included, and it is served only by `GET /api/chats?archived=true`. Soft on purpose: the transcript and its attachments survive.',
  }),
  creatorId: uuid(USER_ID),
  lastMessageAt: dateTime.nullable(),
  createdAt: dateTime,
});

const sessionDto = z.object({
  id: uuid('01930b8e-5c21-7a3e-9d4f-2b7c6e1a0f55'),
  userAgent: z.string().nullable().meta({
    description: 'Truncated, never parsed. A label so someone can tell their own sessions apart.',
  }),
  ipAddress: z.string().nullable(),
  createdAt: dateTime,
  lastUsedAt: dateTime,
  expiresAt: dateTime,
  isCurrent: z.boolean().meta({
    description: 'Decided by the server, so the list and the button that ends it cannot disagree.',
  }),
});

const sessionsDto = z.object({ sessions: z.array(sessionDto) });

const adminUserDto = userDto.extend({
  reviewedAt: dateTime.nullable(),
  chatCount: z.number().int().meta({ description: 'How many conversations they belong to.' }),
});

const adminUsersDto = z.object({
  users: z.array(adminUserDto),
  total: z.number().int().meta({ description: 'Matching the filter, before the limit.' }),
});

const attachmentDto = z.object({
  id: uuid('7e51b0a4-9c38-4d62-a0f7-52b8c1e6d403'),
  fileName: z.string().meta({ example: 'تمرین-سری-۳.pdf' }),
  fileType: z.string().meta({ example: 'application/pdf' }),
  fileSize: z.number().int().meta({ description: 'Bytes.', example: 148_392 }),
});

const messageReplyDto = z.object({
  id: uuid(MESSAGE_ID),
  senderName: z.string().meta({ example: 'دکتر زهرا رضایی' }),
  content: z.string().nullable().meta({ description: 'Null when the quoted message was deleted.' }),
  isDeleted: z.boolean(),
  attachmentCount: z.number().int().meta({
    description: 'A count rather than the files, because a quote is one line of text.',
    example: 0,
  }),
});

const messageReactionDto = z.object({
  emoji: z
    .string()
    .meta({ example: '👍', description: 'One of a fixed set — see REACTION_EMOJIS.' }),
  userIds: z.array(uuid(USER_ID)).meta({
    description:
      'Who reacted. Not a count, and not "did I react": one payload is broadcast to the whole room, so the reader resolves both from this list.',
  }),
});

const messageDto = z.object({
  id: uuid(MESSAGE_ID),
  chatId: uuid(CHAT_ID),
  sender: userSummaryDto,
  content: z
    .string()
    .meta({ example: 'تمرین سری سوم تا پایان هفته تحویل داده شود.' })
    .nullable()
    .meta({
      description: 'Null once soft-deleted — the row survives so reply chains stay intact.',
    }),
  isDeleted: z.boolean(),
  isPinned: z.boolean(),
  systemEvent: z.enum(SYSTEM_EVENTS).nullable().meta({
    description:
      'Null for anything a person typed. When set, `sender` is who acted and `systemTarget` is who it happened to — the row exists so the note interleaves with the transcript in date order.',
  }),
  systemTarget: userSummaryDto.nullable(),
  replyToId: uuid(MESSAGE_ID).nullable(),
  replyTo: messageReplyDto.nullable(),
  attachments: z.array(attachmentDto),
  reactions: z.array(messageReactionDto),
  createdAt: dateTime,
});

const chatListItemDto = chatDto.extend({
  members: z.array(chatMemberDto),
  lastMessage: messageDto.nullable(),
  unreadCount: z.number().int().meta({ example: 3 }),
});

const messageSearchHitDto = z.object({
  message: messageDto,
  chatId: uuid(CHAT_ID),
  chatTitle: z.string().nullable().meta({ example: 'مبانی برنامه‌نویسی — گروه ۲' }),
  chatType: z.enum(CHAT_TYPES),
});

const messageSearchResultsDto = z.object({
  hits: z.array(messageSearchHitDto),
});

const messagePageDto = z.object({
  messages: z.array(messageDto).meta({ description: 'Newest first.' }),
  nextCursor: uuid(MESSAGE_ID).nullable().meta({
    description:
      'Pass as `before` to fetch the next (older) page. Null when the start of the conversation has been reached.',
  }),
});

const pinnedMessagesDto = z.object({ messages: z.array(messageDto) });

const markReadResultDto = z.object({
  chatId: uuid(CHAT_ID),
  upToMessageId: uuid(MESSAGE_ID),
  readAt: dateTime,
  unreadCount: z.number().int().meta({
    description:
      'Recomputed, not assumed to be zero: messages that arrived below the fold while the client was scrolling are still unread.',
    example: 0,
  }),
});

const fieldIssue = z.object({
  path: z.string().meta({
    description: 'Dotted path into the submitted body, e.g. `memberIds.0`.',
    example: 'password',
  }),
  message: z.string().meta({ example: 'گذرواژه باید حداقل ۸ کاراکتر باشه.' }),
});

const apiErrorBody = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES).meta({ description: 'Stable and English — safe to branch on.' }),
    message: z.string().meta({
      description: 'Persian, ready to display as-is.',
      example: 'این گفت‌وگو نیست یا بهش دسترسی نداری.',
    }),
    details: z
      .array(fieldIssue)
      .optional()
      .meta({ description: 'Present on validation failures only.' }),
  }),
});

const serviceInfo = z.object({
  name: z.string().meta({ example: 'Secure Chatbox API' }),
  status: z.string().meta({ example: 'active' }),
});

const healthStatus = z.object({
  status: z.string().meta({ example: 'ok' }),
  uptime: z.number().meta({ description: 'Process uptime in seconds.', example: 1843.21 }),
});

const healthDbStatus = z.object({
  db: z.string().meta({ example: 'ok' }),
  users: z.number().int().meta({ description: 'Row count, proving the query ran.', example: 42 }),
});

const successResult = z.object({ success: z.literal(true) });

const echoResult = z.object({ echoed: z.array(z.string()) });

const registry = z.registry<{ id: string }>();

export const SCHEMA_NAMES = {
  // Requests
  RegisterRequest: registerSchema,
  LoginRequest: loginSchema,
  CreateChatRequest: createChatSchema,
  UpdateChatRequest: updateChatSchema,
  AddMemberRequest: addMemberSchema,
  AdminUpdateUserRequest: adminUpdateUserSchema,
  UpdateMemberRequest: updateMemberSchema,
  SendMessageRequest: sendMessageSchema,
  UploadMessageFields: uploadMessageSchema,
  MarkReadRequest: markReadSchema,
  PinMessageRequest: pinMessageSchema,
  ToggleReactionRequest: toggleReactionSchema,
  EchoRequest: echoSchema,

  // Responses.
  UserSummaryDto: userSummaryDto,
  UserDto: userDto,
  ChatDto: chatDto,
  ChatListItemDto: chatListItemDto,
  ChatMemberDto: chatMemberDto,
  AttachmentDto: attachmentDto,
  AdminUserDto: adminUserDto,
  AdminUsersDto: adminUsersDto,
  SessionDto: sessionDto,
  SessionsDto: sessionsDto,
  MessageReplyDto: messageReplyDto,
  MessageReactionDto: messageReactionDto,
  MessageSearchHitDto: messageSearchHitDto,
  MessageSearchResultsDto: messageSearchResultsDto,
  MessageDto: messageDto,
  MessagePageDto: messagePageDto,
  PinnedMessagesDto: pinnedMessagesDto,
  MarkReadResultDto: markReadResultDto,
  FieldIssue: fieldIssue,
  ApiError: apiErrorBody,
  ServiceInfo: serviceInfo,
  HealthStatus: healthStatus,
  HealthDbStatus: healthDbStatus,
  SuccessResult: successResult,
  EchoResult: echoResult,
} as const;

export type SchemaName = keyof typeof SCHEMA_NAMES;

for (const [id, schema] of Object.entries(SCHEMA_NAMES)) {
  registry.add(schema, { id });
}

export function ref(name: SchemaName): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` };
}

const QUERY_SCHEMAS = {
  ListChatsQuery: listChatsQuerySchema,
  SearchMessagesQuery: searchMessagesQuerySchema,
  UserSearchQuery: userSearchSchema,
  AdminUserQuery: adminUserQuerySchema,
  ListMessagesQuery: listMessagesQuerySchema,
} as const;

export type QuerySchemaName = keyof typeof QUERY_SCHEMAS;

export function queryParameters(
  name: QuerySchemaName,
  descriptions: Partial<Record<string, string>> = {}
): Record<string, unknown>[] {
  const converted = prune(
    z.toJSONSchema(QUERY_SCHEMAS[name], {
      target: 'draft-2020-12',
      io: 'input',
      unrepresentable: 'any',
    })
  ) as { properties?: Record<string, unknown>; required?: string[] };

  const required = new Set(converted.required ?? []);

  return Object.entries(converted.properties ?? {}).map(([property, schema]) => ({
    name: property,
    in: 'query',
    required: required.has(property),
    ...(descriptions[property] === undefined ? {} : { description: descriptions[property] }),
    schema,
  }));
}

export function buildComponentSchemas(): Record<string, unknown> {
  const { schemas } = z.toJSONSchema(registry, {
    uri: (id) => `#/components/schemas/${id}`,
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'any',
  });

  return Object.fromEntries(Object.entries(schemas).map(([id, schema]) => [id, prune(schema)]));
}

function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(prune);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const format = (value as { format?: unknown }).format;
  const formatImpliesPattern = format === 'uuid' || format === 'date-time';

  return Object.fromEntries(
    entries
      .filter(([key]) => key !== '$schema' && key !== '$id')
      .filter(([key]) => !(key === 'pattern' && formatImpliesPattern))
      .map(([key, child]) => [key, prune(child)])
  );
}

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Assert<T extends true> = T;

export type UserSummaryDtoParity = Assert<Exact<z.infer<typeof userSummaryDto>, UserSummaryDto>>;
export type UserDtoParity = Assert<Exact<z.infer<typeof userDto>, UserDto>>;
export type ChatMemberDtoParity = Assert<Exact<z.infer<typeof chatMemberDto>, ChatMemberDto>>;
export type ChatDtoParity = Assert<Exact<z.infer<typeof chatDto>, ChatDto>>;
export type ChatListItemDtoParity = Assert<Exact<z.infer<typeof chatListItemDto>, ChatListItemDto>>;
export type AdminUserDtoParity = Assert<Exact<z.infer<typeof adminUserDto>, AdminUserDto>>;
export type AdminUsersDtoParity = Assert<Exact<z.infer<typeof adminUsersDto>, AdminUsersDto>>;
export type SessionDtoParity = Assert<Exact<z.infer<typeof sessionDto>, SessionDto>>;
export type SessionsDtoParity = Assert<Exact<z.infer<typeof sessionsDto>, SessionsDto>>;
export type AttachmentDtoParity = Assert<Exact<z.infer<typeof attachmentDto>, AttachmentDto>>;
export type MessageReplyDtoParity = Assert<Exact<z.infer<typeof messageReplyDto>, MessageReplyDto>>;
export type MessageReactionDtoParity = Assert<
  Exact<z.infer<typeof messageReactionDto>, MessageReactionDto>
>;
export type MessageDtoParity = Assert<Exact<z.infer<typeof messageDto>, MessageDto>>;
export type MessageSearchHitDtoParity = Assert<
  Exact<z.infer<typeof messageSearchHitDto>, MessageSearchHitDto>
>;
export type MessageSearchResultsDtoParity = Assert<
  Exact<z.infer<typeof messageSearchResultsDto>, MessageSearchResultsDto>
>;
export type MessagePageDtoParity = Assert<Exact<z.infer<typeof messagePageDto>, MessagePageDto>>;
export type PinnedMessagesParity = Assert<
  Exact<z.infer<typeof pinnedMessagesDto>, PinnedMessagesDto>
>;
export type MarkReadResultParity = Assert<
  Exact<z.infer<typeof markReadResultDto>, MarkReadResultDto>
>;
export type FieldIssueParity = Assert<Exact<z.infer<typeof fieldIssue>, FieldIssue>>;
export type ApiErrorBodyParity = Assert<Exact<z.infer<typeof apiErrorBody>, ApiErrorBody>>;
