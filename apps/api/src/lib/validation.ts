import type * as z from 'zod';
import { Errors, toFieldIssues } from './errors';

export function onValidationError(result: {
  success: boolean;
  error?: { issues: readonly z.core.$ZodIssue[] } | undefined;
}): void {
  if (!result.success && result.error) {
    throw Errors.validation(toFieldIssues(result.error.issues));
  }
}

export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw Errors.validation(toFieldIssues(result.error.issues));
  }

  return result.data;
}
