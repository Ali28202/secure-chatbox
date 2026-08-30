export const GLOBAL_ROLES = ['STUDENT', 'PROFESSOR', 'ADMIN'] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

export const CHAT_TYPES = ['DIRECT', 'COURSE_GROUP', 'CUSTOM_GROUP'] as const;
export type ChatType = (typeof CHAT_TYPES)[number];

export const CHAT_ROLES = ['ADMIN', 'MEMBER'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export const RECEIPT_STATUSES = ['DELIVERED', 'READ'] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

export const LIMITS = {
  universityId: { min: 3, max: 16 },
  phoneNumber: { min: 11, max: 11 },
  password: { min: 8, max: 128 },
  name: { min: 3, max: 64 },
  deviceId: { min: 16, max: 128 },
  chatTitle: { min: 2, max: 100 },
  messageContent: { min: 1, max: 4000 },
  page: { default: 50, max: 100 },
} as const;

export const UPLOAD = {
  maxFileBytes: 10 * 1024 * 1024,
  maxFilesPerMessage: 5,
  maxRequestBytes: 5 * 10 * 1024 * 1024 + 1024 * 1024,
} as const;

export const ALLOWED_FILE_TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'application/zip': '.zip',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
} as const;

export type AllowedFileType = keyof typeof ALLOWED_FILE_TYPES;

export function isAllowedFileType(type: string): type is AllowedFileType {
  return Object.hasOwn(ALLOWED_FILE_TYPES, type);
}

export const FILE_ACCEPT = Object.keys(ALLOWED_FILE_TYPES).join(',');

export function isImageType(type: string): boolean {
  return type.startsWith('image/');
}

export const COOKIE_NAMES = {
  access: 'access_token',
  refresh: 'refresh_token',
  sessionHint: 'session_hint',
} as const;

export const REFRESH_COOKIE_PATH = '/api/auth';

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  DEVICE_MISMATCH: 'DEVICE_MISMATCH',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
