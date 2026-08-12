import type { ApiErrorBody } from '@repo/shared';
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { attachmentUrl, getApiError, getApiErrorMessage, getApiFieldIssues } from '@/lib/api';

/**
 * Reading the API's error envelope out of whatever axios threw.
 *
 * Every screen funnels its failures through these three, so their contract is
 * that they answer for *any* input — a rejected request, a thrown string, a 502
 * HTML page from nginx — without a caller ever having to check first. The tests
 * are mostly the inputs that are not the envelope, because those are the ones a
 * running system actually produces.
 */

const NETWORK_FALLBACK = 'ارتباط با سرور برقرار نشد. اتصال خود به شبکهٔ دانشگاه را بررسی کنید.';

/** An axios rejection carrying `data` as its response body. */
function axiosFailure(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response = { status, statusText: '', data, headers: {}, config } as AxiosResponse;
  return new AxiosError('Request failed', String(status), config, {}, response);
}

/** An axios rejection with no response at all — the server was never reached. */
function networkFailure(): AxiosError {
  return new AxiosError('Network Error', AxiosError.ERR_NETWORK, {
    headers: new AxiosHeaders(),
  });
}

const envelope: ApiErrorBody = {
  error: { code: 'FORBIDDEN', message: 'اجازهٔ این کار را ندارید.' },
};

describe('getApiError', () => {
  it('unwraps the envelope', () => {
    expect(getApiError(axiosFailure(403, envelope))).toEqual(envelope.error);
  });

  it('returns null for anything axios did not throw', () => {
    // A bug in a component reaches the same `catch` block as a failed request.
    for (const value of [new Error('boom'), 'boom', null, undefined, { error: envelope.error }]) {
      expect(getApiError(value)).toBeNull();
    }
  });

  it('returns null when the request never got a response', () => {
    expect(getApiError(networkFailure())).toBeNull();
  });

  it('returns null for a body that is not the envelope', () => {
    // nginx answers a dead upstream with HTML, and a proxy timeout with its own
    // JSON. Neither has `error.code`, and neither should be rendered as if it
    // were a message written for this user.
    for (const body of [
      '<html>502 Bad Gateway</html>',
      { message: 'oops' },
      { error: 'oops' },
      null,
    ]) {
      expect(getApiError(axiosFailure(502, body))).toBeNull();
    }
  });
});

describe('getApiErrorMessage', () => {
  it('prefers the Persian message the API sent', () => {
    expect(getApiErrorMessage(axiosFailure(403, envelope))).toBe('اجازهٔ این کار را ندارید.');
  });

  it('blames the network when there is no envelope', () => {
    // The honest guess: no envelope almost always means the request never
    // arrived. "Check your connection to the university network" is something
    // the user can act on; "something went wrong" is not.
    expect(getApiErrorMessage(networkFailure())).toBe(NETWORK_FALLBACK);
    expect(getApiErrorMessage(new Error('boom'))).toBe(NETWORK_FALLBACK);
    expect(getApiErrorMessage(axiosFailure(502, '<html>'))).toBe(NETWORK_FALLBACK);
  });

  it('always returns something renderable', () => {
    expect(getApiErrorMessage(undefined)).toBeTypeOf('string');
  });
});

describe('getApiFieldIssues', () => {
  it('returns the details of a validation failure', () => {
    const issues = getApiFieldIssues(
      axiosFailure(422, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'ورودی نامعتبر است.',
          details: [{ path: 'universityId', message: 'این شناسه قبلاً ثبت شده است.' }],
        },
      })
    );

    expect(issues).toEqual([{ path: 'universityId', message: 'این شناسه قبلاً ثبت شده است.' }]);
  });

  it('returns an empty array, never undefined, when there are none', () => {
    // Callers iterate the result directly; `details` is absent on every error
    // that is not a validation failure, which is most of them.
    expect(getApiFieldIssues(axiosFailure(403, envelope))).toEqual([]);
    expect(getApiFieldIssues(new Error('boom'))).toEqual([]);
  });
});

describe('attachmentUrl', () => {
  it('builds an absolute URL the browser can put in src', () => {
    // Absolute because in development the API is a different origin; behind
    // nginx `NEXT_PUBLIC_API_URL` is empty and the same code yields a path.
    expect(attachmentUrl('0199a0c1-6d3f-7000-8000-000000000001')).toBe(
      `${process.env.NEXT_PUBLIC_API_URL}/api/attachments/0199a0c1-6d3f-7000-8000-000000000001`
    );
  });
});
