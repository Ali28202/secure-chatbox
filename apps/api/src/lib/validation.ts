import type * as z from 'zod';
import { Errors, toFieldIssues } from './errors';

/**
 * Turns `@hono/zod-validator`'s failure into our error envelope.
 *
 * Without this the validator answers with its own bare `{success:false,error}`
 * body and a 400, which would be the one response shape in the API that the
 * web client's error handling does not understand. Throwing instead routes it
 * through `app.onError` like everything else, and yields 422 with Persian
 * per-field messages.
 *
 * Use it as the third argument at each call site rather than wrapping
 * `zValidator` — a wrapper would have to re-declare its generics, and that is
 * what makes `c.req.valid('json')` lose its type.
 *
 *     app.post('/', zValidator('json', schema, onValidationError), (c) => {
 *       const body = c.req.valid('json'); // fully typed
 *     });
 */
export function onValidationError(result: {
  success: boolean;
  error?: { issues: readonly z.core.$ZodIssue[] } | undefined;
}): void {
  if (!result.success && result.error) {
    throw Errors.validation(toFieldIssues(result.error.issues));
  }
}

/**
 * The same thing, for input `zValidator` cannot reach.
 *
 * A multipart body has to be read before it can be validated — the text fields
 * are only knowable once the parts have been parsed — so the validator
 * middleware, which runs before any handler, has nothing to hand a schema. This
 * gives the handler the identical failure shape: 422, Persian, per-field.
 */
export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw Errors.validation(toFieldIssues(result.error.issues));
  }

  return result.data;
}
