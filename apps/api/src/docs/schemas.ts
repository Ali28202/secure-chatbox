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

// -----------------------------------------------------------------------------
// Primitives
// -----------------------------------------------------------------------------

const uuid = (example: string) => z.string().meta({ format: 'uuid', example });

const dateTime = z.string().meta({ format: 'date-time', example: '2026-03-14T09:21:47.000Z' });

const CHAT_ID = '3f8a1c22-4b7e-4d1a-9c6f-1b2e5a7d9014';
const MESSAGE_ID = 'c1d4e77b-2a90-4f35-8e61-7d0b3a5c8f22';
const USER_ID = '9b2f6d10-58c3-4a7e-b1d9-6e4a0c3f5b88';

// -----------------------------------------------------------------------------
// Response DTOs
// -----------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------
// Errors
// -----------------------------------------------------------------------------

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

/** What `GET /` answers with — a liveness banner, not part of `/api`. */
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

// -----------------------------------------------------------------------------
// Registry
// -----------------------------------------------------------------------------

const registry = z.registry<{ id: string }>();

export const SCHEMA_NAMES = {
  // Requests — the schemas the validators actually run.
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

/** An OpenAPI `$ref` to one of the components above, checked at compile time. */
export function ref(name: SchemaName): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` };
}

// -----------------------------------------------------------------------------
// Query strings
// -----------------------------------------------------------------------------

/**
 * The query schemas, deliberately *not* registered as components.
 *
 * OpenAPI models a query string as a list of parameters rather than as an
 * object, so there would be nothing for a `$ref` to point at and a component
 * here would only ever be dead weight in the document. `queryParameters` takes
 * them apart instead — which is what keeps `limit`'s bounds derived from the
 * schema the validator runs rather than copied out beside it and left to rot.
 */
const QUERY_SCHEMAS = {
  UserSearchQuery: userSearchSchema,
  ListMessagesQuery: listMessagesQuerySchema,
} as const;

export type QuerySchemaName = keyof typeof QUERY_SCHEMAS;

/**
 * One OpenAPI `parameter` per property of a query schema.
 *
 * Prose is the one thing a schema cannot supply, so `descriptions` is passed in
 * by the operation that uses it, keyed by property name.
 */
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

/**
 * Converts the whole registry in one pass, so a schema referenced by another —
 * `UserSummaryDto` inside `MessageDto` — becomes a `$ref` rather than a copy.
 *
 * `io: 'input'` is what makes the *request* schemas describe what a client
 * sends rather than what the server ends up with: `phoneNumber` is normalised
 * by a transform and `limit` is coerced from a query string, and the output
 * side of both is a shape no caller ever writes.
 *
 * Response schemas are unaffected by the choice — none of them transform.
 */
export function buildComponentSchemas(): Record<string, unknown> {
  const { schemas } = z.toJSONSchema(registry, {
    uri: (id) => `#/components/schemas/${id}`,
    target: 'draft-2020-12',
    io: 'input',
    // A schema Zod cannot express in JSON Schema should degrade to "anything"
    // rather than abort the document and take the whole reference page with it.
    unrepresentable: 'any',
  });

  return Object.fromEntries(Object.entries(schemas).map(([id, schema]) => [id, prune(schema)]));
}

/**
 * Strips the keywords that are meaningful to a standalone JSON Schema document
 * and noise inside an OpenAPI `components` block.
 *
 * `$schema` and `$id` are the dialect declaration and self-reference of a
 * document that no longer exists once the schema is inlined here. `pattern`
 * goes only where a `format` already states the same rule — Zod emits a
 * 200-character regex for `uuid` and a longer one for `date-time`, and neither
 * tells a reader anything the format keyword has not. A `pattern` with no
 * `format` beside it, such as the device id's, is the only statement of its
 * constraint and stays.
 */
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

// -----------------------------------------------------------------------------
// Parity with the hand-written DTOs
//
// Nothing imports these — `tsc` checks every file under `src/`, so a mirror
// that has drifted from the interface it mirrors is a build error rather than a
// reference page that quietly describes last month's API.
// -----------------------------------------------------------------------------

/** `false` rather than `never` on mismatch — `never extends true` would pass. */
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
