import { describe, expect, it } from 'vitest';
import { consumeVerificationTime, hashPassword, verifyPassword } from './password';

/**
 * These run against the real `Bun.password` — argon2id in the runtime, offloaded
 * to a worker thread — which is why the suite is run with `bun run --bun`. On
 * Node these functions do not exist, and testing a shim would prove nothing
 * about the hashes this platform actually stores.
 *
 * Each hash costs tens of milliseconds by design, so this file is deliberately
 * short: enough calls to pin the behaviour, not enough to make the suite slow.
 */

const PASSWORD = 'Chatbox@1404';

describe('hashPassword', () => {
  it('produces an argon2id hash, not a bare digest', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash).toMatch(/^\$argon2id\$v=19\$/);
  });

  it('never stores the password itself', async () => {
    expect(await hashPassword(PASSWORD)).not.toContain(PASSWORD);
  });

  it('salts, so the same password hashes differently every time', async () => {
    // Without this, identical hashes in the users table would tell anyone who
    // read it which accounts share a password.
    const [first, second] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
    expect(first).not.toBe(second);
  });
});

describe('verifyPassword', () => {
  it('accepts the password it was given', async () => {
    expect(await verifyPassword(PASSWORD, await hashPassword(PASSWORD))).toBe(true);
  });

  it('rejects a wrong password, including one that differs only in case', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
    expect(await verifyPassword(PASSWORD.toLowerCase(), hash)).toBe(false);
    expect(await verifyPassword(`${PASSWORD} `, hash)).toBe(false);
  });

  it('returns false rather than throwing on a corrupt hash', async () => {
    // A hand-edited row or a half-finished migration should fail a login, not
    // take the route down with a 500.
    expect(await verifyPassword(PASSWORD, 'not-a-hash')).toBe(false);
    expect(await verifyPassword(PASSWORD, '')).toBe(false);
  });
});

describe('consumeVerificationTime', () => {
  it('spends about as long as a real verification', async () => {
    // The anti-enumeration defence: `login` calls this when the university id
    // matches nobody, so an unknown account and a wrong password take the same
    // wall-clock time. If this ever became a no-op, the response time would
    // start telling an attacker which student numbers exist — and nothing else
    // in the suite would notice.
    const time = async (run: () => Promise<unknown>) => {
      const started = performance.now();
      await run();
      return performance.now() - started;
    };

    const hash = await hashPassword(PASSWORD);
    const real = await time(() => verifyPassword('wrong-password', hash));
    const dummy = await time(() => consumeVerificationTime('wrong-password'));

    // A loose bound on purpose. The claim is "the same order of magnitude",
    // which is what defeats a timing oracle; a tight ratio would just make this
    // fail on a loaded CI machine.
    expect(dummy).toBeGreaterThan(real / 4);
    expect(dummy).toBeLessThan(real * 4);
  });

  it('resolves without reporting anything about the attempt', async () => {
    await expect(consumeVerificationTime('anything at all')).resolves.toBeUndefined();
  });
});
