import { sign } from 'hono/jwt';
import { describe, expect, it } from 'vitest';
import { env } from '../env';
import { AppError } from './errors';
import { signAuthTokens, signToken, verifyToken } from './jwt';

/**
 * The secrets come from `vitest.config.ts`, not from a `.env`, so this suite
 * cannot pick up a developer's real ones and the hand-forged tokens below have
 * known keys to be forged with.
 */
const subject = { id: '0199a0c1-6d3f-7000-8000-000000000001', role: 'STUDENT' } as const;
const now = () => Math.floor(Date.now() / 1000);

/** Asserts the single 401 every rejection path is supposed to collapse into. */
async function expectRejected(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({
    status: 401,
    code: 'UNAUTHORIZED',
    message: 'نشست شما معتبر نیست یا منقضی شده است. دوباره وارد شوید.',
  });
}

describe('signToken / verifyToken', () => {
  it('round-trips an access token', async () => {
    const token = await signToken('access', subject);
    const payload = await verifyToken('access', token);

    expect(payload.sub).toBe(subject.id);
    expect(payload.role).toBe('STUDENT');
    expect(payload.typ).toBe('access');
  });

  it('round-trips a refresh token', async () => {
    const token = await signToken('refresh', subject);
    expect((await verifyToken('refresh', token)).typ).toBe('refresh');
  });

  it('gives each type the lifetime configured for it', async () => {
    const access = await verifyToken('access', await signToken('access', subject));
    const refresh = await verifyToken('refresh', await signToken('refresh', subject));

    expect(access.exp - access.iat).toBe(env.ACCESS_TOKEN_TTL);
    expect(refresh.exp - refresh.iat).toBe(env.REFRESH_TOKEN_TTL);
    // The point of the split: an access token that leaks is short-lived, and
    // there is no revocation list behind it.
    expect(env.ACCESS_TOKEN_TTL).toBeLessThan(env.REFRESH_TOKEN_TTL);
  });
});

describe('signAuthTokens', () => {
  it('issues both tokens for one subject', async () => {
    const { accessToken, refreshToken } = await signAuthTokens(subject);

    expect((await verifyToken('access', accessToken)).sub).toBe(subject.id);
    expect((await verifyToken('refresh', refreshToken)).sub).toBe(subject.id);
    expect(accessToken).not.toBe(refreshToken);
  });
});

describe('verifyToken rejects', () => {
  it('a refresh token presented as an access token', async () => {
    // The attack this whole design is for: a refresh token is long-lived and
    // sits in a cookie the browser sends to `/api/auth`. Replaying it as an
    // access token would make the short access lifetime meaningless.
    await expectRejected(verifyToken('access', await signToken('refresh', subject)));
  });

  it('an access token presented as a refresh token', async () => {
    await expectRejected(verifyToken('refresh', await signToken('access', subject)));
  });

  it('a token with the right secret but the wrong "typ" claim', async () => {
    // The second half of the defence, and the half that still works if the two
    // secrets are ever set to the same value in a `.env` — the kind of slip
    // nobody notices because everything keeps working.
    const forged = await sign(
      { sub: subject.id, role: subject.role, typ: 'refresh', iat: now(), exp: now() + 900 },
      env.JWT_ACCESS_SECRET,
      'HS256'
    );

    await expectRejected(verifyToken('access', forged));
  });

  it('a token signed with a different algorithm', async () => {
    // Algorithm confusion: `verify` is given `alg` explicitly, so it will not
    // take the token header's word for how to check the signature.
    const forged = await sign(
      { sub: subject.id, role: subject.role, typ: 'access', iat: now(), exp: now() + 900 },
      env.JWT_ACCESS_SECRET,
      'HS512'
    );

    await expectRejected(verifyToken('access', forged));
  });

  it('an expired token', async () => {
    const expired = await sign(
      { sub: subject.id, role: subject.role, typ: 'access', iat: now() - 7200, exp: now() - 3600 },
      env.JWT_ACCESS_SECRET,
      'HS256'
    );

    await expectRejected(verifyToken('access', expired));
  });

  it('a token signed with an unrelated secret', async () => {
    const forged = await sign(
      { sub: subject.id, role: subject.role, typ: 'access', iat: now(), exp: now() + 900 },
      'a-secret-this-server-has-never-heard-of',
      'HS256'
    );

    await expectRejected(verifyToken('access', forged));
  });

  it('a well-signed token that is missing its claims', async () => {
    // Signature alone is not enough — `sub` and `role` are what the request
    // context is built from, and `undefined` there would be a user with no id.
    const empty = await sign({ typ: 'access', exp: now() + 900 }, env.JWT_ACCESS_SECRET, 'HS256');
    await expectRejected(verifyToken('access', empty));
  });

  it('a tampered payload', async () => {
    const token = await signToken('access', subject);
    const [header, , signature] = token.split('.');
    const payload = btoa(
      JSON.stringify({ sub: subject.id, role: 'ADMIN', typ: 'access', exp: now() + 900 })
    ).replace(/=+$/, '');

    await expectRejected(verifyToken('access', `${header}.${payload}.${signature}`));
  });

  it('garbage and empty strings', async () => {
    for (const token of ['', 'not-a-token', 'a.b.c', '...']) {
      await expectRejected(verifyToken('access', token));
    }
  });
});
