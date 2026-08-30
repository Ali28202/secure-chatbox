import {
  ERROR_CODES,
  FA_ERROR_MESSAGES,
  type ApiErrorBody,
  type ErrorCode,
  type FieldIssue,
} from '@repo/shared';
import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type * as z from 'zod';
import { isProduction } from '../env';

export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ErrorCode;
  readonly details: FieldIssue[] | undefined;

  constructor(
    status: ContentfulStatusCode,
    code: ErrorCode,
    message?: string,
    details?: FieldIssue[]
  ) {
    super(message ?? FA_ERROR_MESSAGES[code]);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export const Errors = {
  validation: (details: FieldIssue[], message?: string) =>
    new AppError(422, ERROR_CODES.VALIDATION_ERROR, message, details),
  unauthorized: (message?: string) => new AppError(401, ERROR_CODES.UNAUTHORIZED, message),
  deviceMismatch: (message?: string) => new AppError(401, ERROR_CODES.DEVICE_MISMATCH, message),
  forbidden: (message?: string) => new AppError(403, ERROR_CODES.FORBIDDEN, message),
  notFound: (message?: string) => new AppError(404, ERROR_CODES.NOT_FOUND, message),
  conflict: (message?: string) => new AppError(409, ERROR_CODES.CONFLICT, message),
  payloadTooLarge: (message?: string) => new AppError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, message),
  rateLimited: (message?: string) => new AppError(429, ERROR_CODES.RATE_LIMITED, message),
  internal: (message?: string) => new AppError(500, ERROR_CODES.INTERNAL_ERROR, message),
};

export function toFieldIssues(issues: readonly z.core.$ZodIssue[]): FieldIssue[] {
  return issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  400: ERROR_CODES.VALIDATION_ERROR,
  401: ERROR_CODES.UNAUTHORIZED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.CONFLICT,
  413: ERROR_CODES.PAYLOAD_TOO_LARGE,
  422: ERROR_CODES.VALIDATION_ERROR,
  429: ERROR_CODES.RATE_LIMITED,
};

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json(err.toBody(), err.status);
  }

  if (err instanceof HTTPException) {
    const code = STATUS_TO_CODE[err.status] ?? ERROR_CODES.INTERNAL_ERROR;
    return c.json(new AppError(err.status, code).toBody(), err.status);
  }

  console.error('[unhandled]', err);

  const message = isProduction
    ? FA_ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR]
    : `${FA_ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR]} (${err instanceof Error ? err.message : String(err)})`;

  return c.json(Errors.internal(message).toBody(), 500);
};

export const notFoundHandler: NotFoundHandler = (c) =>
  c.json(new AppError(404, ERROR_CODES.NOT_FOUND, 'این نشانی در سرور وجود ندارد.').toBody(), 404);
