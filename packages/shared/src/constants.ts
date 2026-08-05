/**
 * Values the API and the web client both need to agree on.
 *
 * The role/type unions below deliberately duplicate the Prisma enums rather
 * than importing them: `@repo/database` must never become a dependency of
 * `apps/web`, or Prisma's WASM ends up in the Turbopack graph. The duplication
 * is kept honest by `apps/api/src/lib/enum-parity.ts`, which fails typecheck
 * if the two definitions ever drift apart.
 */

export const GLOBAL_ROLES = ['STUDENT', 'PROFESSOR', 'ADMIN'] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

export const CHAT_TYPES = ['DIRECT', 'COURSE_GROUP', 'CUSTOM_GROUP'] as const;
export type ChatType = (typeof CHAT_TYPES)[number];

export const CHAT_ROLES = ['ADMIN', 'MEMBER'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export const RECEIPT_STATUSES = ['DELIVERED', 'READ'] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

/**
 * Field bounds, in one place so the Zod schemas, the database columns and the
 * UI's `maxLength` attributes cannot disagree.
 */
export const LIMITS = {
  universityId: { min: 3, max: 32 },
  password: { min: 8, max: 128 },
  name: { min: 3, max: 64 },
  chatTitle: { min: 2, max: 100 },
  messageContent: { min: 1, max: 4000 },
  /** Cursor page size for message history and chat lists. */
  page: { default: 50, max: 100 },
} as const;

export const COOKIE_NAMES = {
  access: 'access_token',
  refresh: 'refresh_token',
  /**
   * Carries no token — its presence alone says "this browser may have a live
   * session", and it is set and cleared in lockstep with the two real cookies.
   *
   * The web client's `proxy.ts` needs to decide whether to render the app or
   * send the visitor to the login page, and neither real cookie can tell it:
   * the access cookie expires after fifteen minutes while the session is still
   * good for a week, and the refresh cookie is deliberately scoped to
   * `REFRESH_COOKIE_PATH`, so a page request never carries it.
   *
   * It is a navigation hint and **never an authorization decision**. Anyone can
   * forge it; all they win is a page that immediately asks the API for data and
   * gets a 401. Authorization lives on the API, where the signature is checked.
   */
  sessionHint: 'session_hint',
} as const;

/**
 * The refresh cookie is scoped to the auth routes so it is not attached to
 * every ordinary API call — it only travels where it is actually needed.
 */
export const REFRESH_COOKIE_PATH = '/api/auth';

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
