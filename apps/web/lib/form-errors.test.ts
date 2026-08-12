import type { FieldIssue } from '@repo/shared';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import type { UseFormSetError } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { applyApiFieldIssues } from '@/lib/form-errors';

/**
 * Putting the API's validation messages under the right inputs.
 *
 * The interesting case is the one where it refuses: `setError` on a name the
 * form does not have creates an error that no input renders, and react-hook-form
 * will not submit a form that holds an error. A server naming a field the form
 * lacks would therefore produce a form that silently stops working — so the
 * allowlist is the point of this function, and the return value is how the
 * caller learns it has to show the message some other way.
 */

interface LoginFields extends Record<string, unknown> {
  universityId: string;
  password: string;
}

/** A 422 from the API carrying `details`. */
function validationError(details: FieldIssue[]): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response = {
    status: 422,
    statusText: '',
    data: { error: { code: 'VALIDATION_ERROR', message: 'ورودی نامعتبر است.', details } },
    headers: {},
    config,
  } as AxiosResponse;
  return new AxiosError('Request failed', '422', config, {}, response);
}

const FIELDS = ['universityId', 'password'] as const;

describe('applyApiFieldIssues', () => {
  it('sets the message on the matching field', () => {
    const setError = vi.fn() as unknown as UseFormSetError<LoginFields>;

    const applied = applyApiFieldIssues(
      validationError([{ path: 'universityId', message: 'این شناسه قبلاً ثبت شده است.' }]),
      setError,
      FIELDS
    );

    expect(applied).toBe(true);
    expect(setError).toHaveBeenCalledWith('universityId', {
      type: 'server',
      message: 'این شناسه قبلاً ثبت شده است.',
    });
  });

  it('applies every issue in one pass', () => {
    const setError = vi.fn() as unknown as UseFormSetError<LoginFields>;

    applyApiFieldIssues(
      validationError([
        { path: 'universityId', message: 'شناسه نامعتبر است.' },
        { path: 'password', message: 'گذرواژه کوتاه است.' },
      ]),
      setError,
      FIELDS
    );

    expect(setError).toHaveBeenCalledTimes(2);
  });

  it('ignores a field the form does not have', () => {
    // The failure this exists to prevent: an error on `role` would block submit
    // with nothing on screen to explain why or to clear it.
    const setError = vi.fn() as unknown as UseFormSetError<LoginFields>;

    const applied = applyApiFieldIssues(
      validationError([{ path: 'role', message: 'نقش نامعتبر است.' }]),
      setError,
      FIELDS
    );

    expect(applied).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it('reports true when at least one issue landed', () => {
    // Mixed batch: the caller has shown something, so it should not also toast.
    const setError = vi.fn() as unknown as UseFormSetError<LoginFields>;

    const applied = applyApiFieldIssues(
      validationError([
        { path: 'role', message: 'نقش نامعتبر است.' },
        { path: 'password', message: 'گذرواژه کوتاه است.' },
      ]),
      setError,
      FIELDS
    );

    expect(applied).toBe(true);
    expect(setError).toHaveBeenCalledTimes(1);
  });

  it('matches whole paths, not prefixes', () => {
    // `passwordConfirm` is not `password`, and a nested path like `members.0.id`
    // is not the `members` field.
    const setError = vi.fn() as unknown as UseFormSetError<LoginFields>;

    const applied = applyApiFieldIssues(
      validationError([{ path: 'passwordConfirm', message: 'مطابقت ندارد.' }]),
      setError,
      FIELDS
    );

    expect(applied).toBe(false);
  });

  it('does nothing for an error that has no field details', () => {
    // A 401 or a dropped connection reaches the same handler as a 422.
    const setError = vi.fn() as unknown as UseFormSetError<LoginFields>;

    expect(applyApiFieldIssues(new Error('boom'), setError, FIELDS)).toBe(false);
    expect(applyApiFieldIssues(validationError([]), setError, FIELDS)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});
