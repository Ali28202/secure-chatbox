import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../lib/errors';
import { signToken } from '../../lib/jwt';
import { hashPassword } from '../../lib/password';

/**
 * `auth.service` against a mocked Prisma client.
 *
 * The database is mocked and nothing else is. The argon2id hashing, the JWT
 * signing and the mappers all run for real, because the properties worth
 * asserting here are exactly the ones a stub would have to fake: that a wrong
 * password and an unknown user are indistinguishable, that a disabled account is
 * only reported to someone who proved they own it, and that a hash is what gets
 * written rather than a password.
 *
 * `vi.mock` is hoisted above the imports, so `authService` is imported lazily
 * inside the suite — importing it at the top would pull in the real client
 * before the mock is in place.
 */

const prisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('@repo/database', () => ({ prisma }));

const { authService } = await import('./auth.service');

const PASSWORD = 'Chatbox@1404';
const INVALID_CREDENTIALS = 'شناسهٔ دانشگاهی یا گذرواژه نادرست است.';

const userRow = (overrides: Record<string, unknown> = {}) => ({
  id: '0199a0c1-6d3f-7000-8000-000000000001',
  name: 'علی محلاتی',
  universityId: '40012301',
  role: 'STUDENT',
  isActive: true,
  lastSeen: null,
  createdAt: new Date('2026-08-01T08:00:00.000Z'),
  ...overrides,
});

/** Runs `fn` and returns the AppError it threw. */
async function rejection(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (error) {
    return error as AppError;
  }
  throw new Error('expected the call to reject');
}

beforeEach(() => {
  vi.clearAllMocks();
  // `issueSession` stamps `lastSeen` and returns the refreshed row.
  prisma.user.update.mockImplementation(async ({ where }: { where: { id: string } }) =>
    userRow({ id: where.id, lastSeen: new Date() })
  );
});

describe('register', () => {
  it('creates a user and returns them without a password hash', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(userRow());

    const user = await authService.register({
      universityId: '40012301',
      password: PASSWORD,
      name: 'علی محلاتی',
    });

    expect(user).not.toHaveProperty('passwordHash');
    expect(user.universityId).toBe('40012301');
  });

  it('stores an argon2id hash, never the password', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(userRow());

    await authService.register({
      universityId: '40012301',
      password: PASSWORD,
      name: 'علی محلاتی',
    });

    const { data } = prisma.user.create.mock.calls[0]![0];
    expect(data.passwordHash).toMatch(/^\$argon2id\$/);
    expect(data.passwordHash).not.toContain(PASSWORD);
  });

  it('forces the STUDENT role regardless of anything in the input', async () => {
    // The second half of the defence in `registerSchema`, which strips `role`
    // before it gets here. Both are needed: the schema guards the HTTP route,
    // this guards every other caller of the service.
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(userRow());

    await authService.register({
      universityId: '40012301',
      password: PASSWORD,
      name: 'علی محلاتی',
      role: 'PROFESSOR',
    } as never);

    expect(prisma.user.create.mock.calls[0]![0].data.role).toBe('STUDENT');
  });

  it('rejects a university id that is already taken', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    const error = await rejection(() =>
      authService.register({ universityId: '40012301', password: PASSWORD, name: 'کس دیگر' })
    );

    expect(error.status).toBe(409);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe('login', () => {
  it('returns the user and a token pair on correct credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...userRow(),
      passwordHash: await hashPassword(PASSWORD),
    });

    const result = await authService.login({ universityId: '40012301', password: PASSWORD });

    expect(result.user.universityId).toBe('40012301');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.tokens.accessToken).toBeTypeOf('string');
    expect(result.tokens.refreshToken).toBeTypeOf('string');
    expect(result.tokens.accessToken).not.toBe(result.tokens.refreshToken);
  });

  it('stamps lastSeen', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...userRow(),
      passwordHash: await hashPassword(PASSWORD),
    });

    await authService.login({ universityId: '40012301', password: PASSWORD });

    expect(prisma.user.update.mock.calls[0]![0].data.lastSeen).toBeInstanceOf(Date);
  });

  it('gives an unknown id and a wrong password the same answer', async () => {
    // The property this whole path is shaped around. If these differed by
    // status, code or message, the login form would be an oracle for which
    // student numbers are registered.
    prisma.user.findUnique.mockResolvedValueOnce(null);
    const unknown = await rejection(() =>
      authService.login({ universityId: '99999999', password: PASSWORD })
    );

    prisma.user.findUnique.mockResolvedValueOnce({
      ...userRow(),
      passwordHash: await hashPassword(PASSWORD),
    });
    const wrongPassword = await rejection(() =>
      authService.login({ universityId: '40012301', password: 'not-the-password' })
    );

    expect(unknown.status).toBe(401);
    expect(unknown.message).toBe(INVALID_CREDENTIALS);
    expect(wrongPassword.status).toBe(unknown.status);
    expect(wrongPassword.code).toBe(unknown.code);
    expect(wrongPassword.message).toBe(unknown.message);
  });

  it('spends verification time on an unknown id instead of failing instantly', async () => {
    // Identical messages are not enough on their own: returning in a
    // microsecond when the id is unknown, and in ~50ms when it is not, says the
    // same thing the message refuses to.
    prisma.user.findUnique.mockResolvedValue(null);

    const started = performance.now();
    await rejection(() => authService.login({ universityId: '99999999', password: PASSWORD }));

    expect(performance.now() - started).toBeGreaterThan(5);
  });

  it('checks the password before the active flag', async () => {
    // A disabled account must not announce itself to someone who has not proven
    // they own it — "this account is disabled" confirms the id exists.
    prisma.user.findUnique.mockResolvedValue({
      ...userRow({ isActive: false }),
      passwordHash: await hashPassword(PASSWORD),
    });

    const wrongPassword = await rejection(() =>
      authService.login({ universityId: '40012301', password: 'not-the-password' })
    );
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.message).toBe(INVALID_CREDENTIALS);

    // With the right password, the real reason comes out.
    const correct = await rejection(() =>
      authService.login({ universityId: '40012301', password: PASSWORD })
    );
    expect(correct.status).toBe(403);
    expect(correct.message).toContain('غیرفعال');
  });

  it('issues no session to a disabled account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...userRow({ isActive: false }),
      passwordHash: await hashPassword(PASSWORD),
    });

    await rejection(() => authService.login({ universityId: '40012301', password: PASSWORD }));
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('survives a corrupt hash as a 401 rather than a 500', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...userRow(), passwordHash: '' });

    const error = await rejection(() =>
      authService.login({ universityId: '40012301', password: PASSWORD })
    );
    expect(error.status).toBe(401);
  });
});

describe('verifyToken', () => {
  const subject = { id: userRow().id as string, role: 'STUDENT' as const };

  it('resolves the account behind a valid access token', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow());
    const user = await authService.verifyToken(await signToken('access', subject));
    expect(user.id).toBe(subject.id);
  });

  it('re-reads the user on every call', async () => {
    // The reason it touches the database at all: a token stays
    // cryptographically valid until it expires, so an account an admin disables
    // would otherwise keep working for the rest of the token's life.
    prisma.user.findUnique.mockResolvedValue(userRow({ isActive: false }));

    const error = await rejection(async () =>
      authService.verifyToken(await signToken('access', subject))
    );

    expect(error.status).toBe(403);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: subject.id } })
    );
  });

  it('rejects a token for a user who has since been deleted', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const error = await rejection(async () =>
      authService.verifyToken(await signToken('access', subject))
    );
    expect(error.status).toBe(401);
  });

  it('refuses a refresh token where an access token is expected', async () => {
    const error = await rejection(async () =>
      authService.verifyToken(await signToken('refresh', subject))
    );

    expect(error.status).toBe(401);
    // Rejected on the token alone — the database is never consulted.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('refresh', () => {
  const subject = { id: userRow().id as string, role: 'STUDENT' as const };

  it('rotates both tokens, not just the access one', async () => {
    // A captured refresh token then has a useful life measured in minutes
    // rather than the week its expiry allows.
    prisma.user.findUnique.mockResolvedValue(userRow());

    const original = await signToken('refresh', subject);
    const { tokens } = await authService.refresh(original);

    expect(tokens.refreshToken).toBeTypeOf('string');
    expect(tokens.accessToken).not.toBe(tokens.refreshToken);
  });

  it('refuses an access token presented as a refresh token', async () => {
    const error = await rejection(async () =>
      authService.refresh(await signToken('access', subject))
    );
    expect(error.status).toBe(401);
  });

  it('refuses a refresh token belonging to a disabled account', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow({ isActive: false }));
    const error = await rejection(async () =>
      authService.refresh(await signToken('refresh', subject))
    );
    expect(error.status).toBe(403);
  });
});
