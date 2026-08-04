import type { ErrorCode } from '../constants';

/** One failed field, flattened so the UI can look it up by form field name. */
export interface FieldIssue {
  /** Dotted path into the submitted body, e.g. `memberIds.0`. */
  path: string;
  message: string;
}

/**
 * The single shape every failing response has.
 *
 * Successful responses are *not* wrapped — they return their payload directly,
 * so react-query hooks get the data with no unwrapping step. Only errors get an
 * envelope, because only errors need a machine-readable code alongside the
 * human-readable text.
 */
export interface ApiErrorBody {
  error: {
    /** Stable and English — safe to branch on. */
    code: ErrorCode;
    /** Persian, ready to display as-is. */
    message: string;
    /** Present on validation failures only. */
    details?: FieldIssue[];
  };
}

/**
 * Narrows an unknown response body — used by the web client's axios
 * interceptor, which sees `unknown` for any non-2xx payload.
 */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const { error } = value as { error: unknown };
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}
