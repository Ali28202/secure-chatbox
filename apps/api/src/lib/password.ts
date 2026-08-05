/**
 * Password hashing.
 *
 * `Bun.password` is argon2id from the runtime itself — the current OWASP
 * recommendation for new applications, and offloaded to a worker thread so a
 * login does not stall the event loop. (bcryptjs, the usual npm choice, is
 * pure JavaScript and blocks it.) The algorithm, cost parameters and salt are
 * all encoded in the resulting `$argon2id$v=19$m=…` string, so `verify` needs
 * no configuration and old hashes keep working if the cost is ever raised.
 */

const ALGORITHM = 'argon2id' as const;

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, ALGORITHM);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

/**
 * A hash of a password nobody has. Its only purpose is to be *verified
 * against* when the submitted `universityId` does not exist.
 *
 * Without it, a failed login for an unknown user returns in microseconds while
 * a failed login for a real user takes the ~50ms argon2id deliberately costs.
 * That difference is measurable over the network, and it turns the login form
 * into an oracle for "does this student number have an account here" — which
 * on a campus intranet is a roster of who is enrolled.
 *
 * Randomised per boot: it is never matched, so its content is irrelevant, and
 * a random one cannot be mistaken for a real credential in a memory dump.
 */
const DUMMY_HASH = await hashPassword(`unusable-${crypto.randomUUID()}`);

/** Burns the same time a real password check would. The result is discarded. */
export async function consumeVerificationTime(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH);
}
