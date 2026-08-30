import {
  CHAT_ROLES,
  CHAT_TYPES,
  ERROR_CODES,
  GLOBAL_ROLES,
  addMemberSchema,
  createChatSchema,
  listMessagesQuerySchema,
  loginSchema,
  markReadSchema,
  pinMessageSchema,
  registerSchema,
  sendMessageSchema,
  updateChatSchema,
  updateMemberSchema,
  uploadMessageSchema,
  userSearchSchema,
  type ApiErrorBody,
  type AttachmentDto,
  type ChatDto,
  type ChatListItemDto,
  type ChatMemberDto,
  type FieldIssue,
  type MarkReadResultDto,
  type MessageDto,
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
});

const userDto = userSummaryDto.extend({
  phoneNumber: z
    .string()
    .meta({ example: '09351230001' })
    .nullable()
    .meta({ description: 'Null for accounts that predate the phone-number identifier.' }),
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
  creatorId: uuid(USER_ID),
  lastMessageAt: dateTime.nullable(),
  createdAt: dateTime,
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
  replyToId: uuid(MESSAGE_ID).nullable(),
  replyTo: messageReplyDto.nullable(),
  attachments: z.array(attachmentDto),
  createdAt: dateTime,
});

const chatListItemDto = chatDto.extend({
  members: z.array(chatMemberDto),
  lastMessage: messageDto.nullable(),
  unreadCount: z.number().int().meta({ example: 3 }),
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
  message: z.string().meta({ example: 'گذرواژه باید دست‌کم ۸ کاراکتر باشد.' }),
});

const apiErrorBody = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES).meta({ description: 'Stable and English — safe to branch on.' }),
    message: z.string().meta({
      description: 'Persian, ready to display as-is.',
      example: 'این گفت‌وگو وجود ندارد یا به آن دسترسی ندارید.',
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
  UpdateMemberRequest: updateMemberSchema,
  SendMessageRequest: sendMessageSchema,
  UploadMessageFields: uploadMessageSchema,
  MarkReadRequest: markReadSchema,
  PinMessageRequest: pinMessageSchema,
  EchoRequest: echoSchema,

  // Responses.
  UserSummaryDto: userSummaryDto,
  UserDto: userDto,
  ChatDto: chatDto,
  ChatListItemDto: chatListItemDto,
  ChatMemberDto: chatMemberDto,
  AttachmentDto: attachmentDto,
  MessageReplyDto: messageReplyDto,
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
  UserSearchQuery: userSearchSchema,
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
export type AttachmentDtoParity = Assert<Exact<z.infer<typeof attachmentDto>, AttachmentDto>>;
export type MessageReplyDtoParity = Assert<Exact<z.infer<typeof messageReplyDto>, MessageReplyDto>>;
export type MessageDtoParity = Assert<Exact<z.infer<typeof messageDto>, MessageDto>>;
export type MessagePageDtoParity = Assert<Exact<z.infer<typeof messagePageDto>, MessagePageDto>>;
export type PinnedMessagesParity = Assert<
  Exact<z.infer<typeof pinnedMessagesDto>, PinnedMessagesDto>
>;
export type MarkReadResultParity = Assert<
  Exact<z.infer<typeof markReadResultDto>, MarkReadResultDto>
>;
export type FieldIssueParity = Assert<Exact<z.infer<typeof fieldIssue>, FieldIssue>>;
export type ApiErrorBodyParity = Assert<Exact<z.infer<typeof apiErrorBody>, ApiErrorBody>>;
