import { FA_ERROR_MESSAGES } from '@repo/shared';
import * as z from 'zod';
import { describe, expect, it } from 'vitest';
import { AppError, Errors, toFieldIssues } from './errors';

describe('AppError', () => {
  it('falls back to the shared Persian text for its code', () => {
    // So a route can `throw Errors.notFound()` and still say something useful.
    const error = new AppError(404, 'NOT_FOUND');
    expect(error.message).toBe(FA_ERROR_MESSAGES.NOT_FOUND);
  });

  it('prefers a message the route wrote itself', () => {
    const error = new AppError(403, 'FORBIDDEN', 'این گفت‌وگو فقط‌خواندنی است.');
    expect(error.message).toBe('این گفت‌وگو فقط‌خواندنی است.');
  });

  it('is a real Error, so it survives a throw', () => {
    const error = new AppError(409, 'CONFLICT');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(() => {
      throw error;
    }).toThrow(AppError);
  });

  it('serializes to the envelope the web client parses', () => {
    expect(new AppError(401, 'UNAUTHORIZED', 'وارد شوید.').toBody()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'وارد شوید.' },
    });
  });

  it('omits `details` entirely when there are none', () => {
    // Not `details: undefined` — this goes through `JSON.stringify`, and the
    // client checks for the key's presence.
    const body = new AppError(500, 'INTERNAL_ERROR').toBody();
    expect(body.error).not.toHaveProperty('details');
  });

  it('carries field issues when it has them', () => {
    const details = [{ path: 'password', message: 'گذرواژه کوتاه است.' }];
    expect(new AppError(422, 'VALIDATION_ERROR', 'ورودی نامعتبر است.', details).toBody()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'ورودی نامعتبر است.', details },
    });
  });
});

describe('Errors', () => {
  it('pairs each constructor with the status and code it stands for', () => {
    const expected = [
      [Errors.unauthorized(), 401, 'UNAUTHORIZED'],
      [Errors.forbidden(), 403, 'FORBIDDEN'],
      [Errors.notFound(), 404, 'NOT_FOUND'],
      [Errors.conflict(), 409, 'CONFLICT'],
      [Errors.payloadTooLarge(), 413, 'PAYLOAD_TOO_LARGE'],
      [Errors.validation([]), 422, 'VALIDATION_ERROR'],
      [Errors.rateLimited(), 429, 'RATE_LIMITED'],
      [Errors.internal(), 500, 'INTERNAL_ERROR'],
    ] as const;

    for (const [error, status, code] of expected) {
      expect(error.status, code).toBe(status);
      expect(error.code).toBe(code);
      expect(error.message, code).toMatch(/\S/);
    }
  });
});

describe('toFieldIssues', () => {
  it('flattens a Zod issue into the shape the forms read', () => {
    const schema = z.object({ password: z.string().min(8, { error: 'گذرواژه کوتاه است.' }) });
    const result = schema.safeParse({ password: 'short' });

    expect(toFieldIssues(result.error!.issues)).toEqual([
      { path: 'password', message: 'گذرواژه کوتاه است.' },
    ]);
  });

  it('joins a nested path with dots so react-hook-form can find the field', () => {
    const schema = z.object({ members: z.array(z.object({ id: z.uuid({ error: 'نامعتبر' }) })) });
    const result = schema.safeParse({ members: [{ id: 'nope' }] });

    expect(toFieldIssues(result.error!.issues)[0]?.path).toBe('members.0.id');
  });

  it('reports a top-level refinement failure with an empty path', () => {
    // A form shows these as a general error rather than beside a field, which
    // is why an empty string is the right answer and not a crash.
    const schema = z.object({ a: z.string().optional() }).refine(() => false, { error: 'خطا' });
    const result = schema.safeParse({});

    expect(toFieldIssues(result.error!.issues)).toEqual([{ path: '', message: 'خطا' }]);
  });

  it('keeps every issue, not just the first', () => {
    const schema = z.object({ a: z.string(), b: z.string() });
    expect(toFieldIssues(schema.safeParse({}).error!.issues)).toHaveLength(2);
  });
});
