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
 * only reported to someone who proved they own it, that a hash is what gets
 * written rather than a password, and that a token signed for one device is
 * refused once the account has moved to another.
 *
 * `vi.mock` is hoisted above the imports, so `authService` is imported lazily
 * inside the suite — importing it at the top would pull in the real client
 * before the mock is in place.
 */

const prisma = {
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('@repo/database', () => ({ prisma }));

const { authService } = await import('./auth.service');

const PASSWORD = 'Chatbox@1404';
const INVALID_CREDENTIALS = 'شناسه یا گذرواژه نادرست است.';

/** Two browsers on two machines, in the shape `lib/device-id.ts` mints. */
const DEVICE_A = 'aaaa1111-00112233445566778899aabbccddeeff';
const DEVICE_B = 'bbbb2222-ffeeddccbbaa99887766554433221100';

const userRow = (overrides: Record<string, unknown> = {}) => ({
  id: '0199a0c1-6d3f-7000-8000-000000000001',
  name: 'علی محلاتی',
  universityId: '40012301',
  phoneNumber: '09121110001',
  role: 'STUDENT',
  isActive: true,
  deviceId: DEVICE_A,
  lastSeen: null,
  createdAt: new Date('2026-08-01T08:00:00.000Z'),
  ...overrides,
});

const credentials = (overrides: Record<string, unknown> = {}) => ({
  identifier: '40012301',
  password: PASSWORD,
  deviceId: DEVICE_A,
  ...overrides,
});

const account = (overrides: Record<string, unknown> = {}) => ({
  universityId: '40012301',
  phoneNumber: '09121110001',
  password: PASSWORD,
  name: 'علی محلاتی',
  ...overrides,
});

/** The row `login` reads, password hash and all. */
async function withHash(overrides: Record<string, unknown> = {}) {
  return { ...userRow(overrides), passwordHash: await hashPassword(PASSWORD) };
}

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
  // `issueSession` stamps `lastSeen`, binds the device, and returns the row it
  // wrote — so the mock echoes `data` back rather than inventing a row that
  // disagrees with the update that just happened.
  prisma.user.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
      userRow({ id: where.id, ...data })
  );
});

describe('register', () => {
  it('creates a user and returns them without a password hash', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(userRow());

    const user = await authService.register(account());

    expect(user).not.toHaveProperty('passwordHash');
    expect(user.universityId).toBe('40012301');
    expect(user.phoneNumber).toBe('09121110001');
  });

  it('stores an argon2id hash, never the password', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(userRow());

    await authService.register(account());

    const { data } = prisma.user.create.mock.calls[0]![0];
    expect(data.passwordHash).toMatch(/^\$argon2id\$/);
    expect(data.passwordHash).not.toContain(PASSWORD);
  });

  it('forces the STUDENT role regardless of anything in the input', async () => {
    // The second half of the defence in `registerSchema`, which strips `role`
    // before it gets here. Both are needed: the schema guards the HTTP route,
    // this guards every other caller of the service.
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(userRow());

    await authService.register(account({ role: 'PROFESSOR' }) as never);

    expect(prisma.user.create.mock.calls[0]![0].data.role).toBe('STUDENT');
  });

  it('binds no device — that happens at the first login', async () => {
    // Registration has no device to bind to. The account holds none until
    // someone signs in from one, which is why the column is nullable.
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(userRow());

    await authService.register(account());

    expect(prisma.user.create.mock.calls[0]![0].data).not.toHaveProperty('deviceId');
  });

  it('rejects a university id that is already taken', async () => {
    prisma.user.findFirst.mockResolvedValue({ universityId: '40012301' });

    const error = await rejection(() => authService.register(account({ name: 'کس دیگر' })));

    expect(error.status).toBe(409);
    expect(error.message).toContain('شناسهٔ دانشگاهی');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('names the phone number when that is what collided', async () => {
    // Both columns are unique and one query checks both, so the message has to
    // be chosen from the row that came back — otherwise someone whose phone
    // number is taken is told to change their student number.
    prisma.user.findFirst.mockResolvedValue({ universityId: 'somebody-else' });

    const error = await rejection(() => authService.register(account()));

    expect(error.status).toBe(409);
    expect(error.message).toContain('شمارهٔ تلفن');
  });
});

describe('login', () => {
  it('returns the user and a token pair on correct credentials', async () => {
    prisma.user.findMany.mockResolvedValue([await withHash()]);

    const result = await authService.login(credentials());

    expect(result.user.universityId).toBe('40012301');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.tokens.accessToken).toBeTypeOf('string');
    expect(result.tokens.refreshToken).toBeTypeOf('string');
    expect(result.tokens.accessToken).not.toBe(result.tokens.refreshToken);
  });

  it('stamps lastSeen and binds the device in one write', async () => {
    prisma.user.findMany.mockResolvedValue([await withHash()]);

    await authService.login(credentials({ deviceId: DEVICE_B }));

    const { data } = prisma.user.update.mock.calls[0]![0];
    expect(data.lastSeen).toBeInstanceOf(Date);
    expect(data.deviceId).toBe(DEVICE_B);
  });

  it('accepts a phone number in place of a university id', async () => {
    prisma.user.findMany.mockResolvedValue([await withHash()]);

    const result = await authService.login(credentials({ identifier: '09121110001' }));

    expect(result.user.id).toBe(userRow().id);
  });

  it('looks the identifier up as either column, normalising the phone form', async () => {
    // Persian digits survive `identifierSchema`, which only trims — so folding
    // them is this method's job, and a lookup for «۰۹۱۲…» would find nobody.
    prisma.user.findMany.mockResolvedValue([]);

    await rejection(() => authService.login(credentials({ identifier: '۰۹۱۲۱۱۱۰۰۰۱' })));

    expect(prisma.user.findMany.mock.calls[0]![0].where).toEqual({
      OR: [{ universityId: '۰۹۱۲۱۱۱۰۰۰۱' }, { phoneNumber: '09121110001' }],
    });
  });

  it('lets a university id win when it also reads as someone else’s phone number', async () => {
    // Two unique columns can both match one string. Resolving it the same way
    // every time matters more than which way: the alternative is a login that
    // reaches a different account depending on row order.
    const phoneOwner = await withHash({ id: 'phone-owner', universityId: '09121110001-other' });
    const idOwner = await withHash({ id: 'id-owner', universityId: '09121110001' });
    prisma.user.findMany.mockResolvedValue([phoneOwner, idOwner]);

    const result = await authService.login(credentials({ identifier: '09121110001' }));

    expect(result.user.id).toBe('id-owner');
  });

  it('reports the device it displaced so the gateway can close its sockets', async () => {
    prisma.user.findMany.mockResolvedValue([await withHash({ deviceId: DEVICE_A })]);

    const result = await authService.login(credentials({ deviceId: DEVICE_B }));

    expect(result.revokedDeviceId).toBe(DEVICE_A);
  });

  it('displaces nothing when the same browser signs in again', async () => {
    // The common case by a wide margin, and the one that must not close the
    // sockets this very login is about to use.
    prisma.user.findMany.mockResolvedValue([await withHash({ deviceId: DEVICE_A })]);

    const result = await authService.login(credentials({ deviceId: DEVICE_A }));

    expect(result.revokedDeviceId).toBeNull();
  });

  it('displaces nothing on a first-ever login', async () => {
    prisma.user.findMany.mockResolvedValue([await withHash({ deviceId: null })]);

    const result = await authService.login(credentials());

    expect(result.revokedDeviceId).toBeNull();
  });

  it('gives an unknown id and a wrong password the same answer', async () => {
    // The property this whole path is shaped around. If these differed by
    // status, code or message, the login form would be an oracle for which
    // student numbers are registered.
    prisma.user.findMany.mockResolvedValueOnce([]);
    const unknown = await rejection(() =>
      authService.login(credentials({ identifier: '99999999' }))
    );

    prisma.user.findMany.mockResolvedValueOnce([await withHash()]);
    const wrongPassword = await rejection(() =>
      authService.login(credentials({ password: 'not-the-password' }))
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
    prisma.user.findMany.mockResolvedValue([]);

    const started = performance.now();
    await rejection(() => authService.login(credentials({ identifier: '99999999' })));

    expect(performance.now() - started).toBeGreaterThan(5);
  });

  it('checks the password before the active flag', async () => {
    // A disabled account must not announce itself to someone who has not proven
    // they own it — "this account is disabled" confirms the id exists.
    prisma.user.findMany.mockResolvedValue([await withHash({ isActive: false })]);

    const wrongPassword = await rejection(() =>
      authService.login(credentials({ password: 'not-the-password' }))
    );
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.message).toBe(INVALID_CREDENTIALS);

    // With the right password, the real reason comes out.
    const correct = await rejection(() => authService.login(credentials()));
    expect(correct.status).toBe(403);
    expect(correct.message).toContain('غیرفعال');
  });

  it('issues no session to a disabled account', async () => {
    prisma.user.findMany.mockResolvedValue([await withHash({ isActive: false })]);

    await rejection(() => authService.login(credentials()));
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('survives a corrupt hash as a 401 rather than a 500', async () => {
    prisma.user.findMany.mockResolvedValue([{ ...userRow(), passwordHash: '' }]);

    const error = await rejection(() => authService.login(credentials()));
    expect(error.status).toBe(401);
  });
});

describe('verifyToken', () => {
  const subject = { id: userRow().id as string, role: 'STUDENT' as const, deviceId: DEVICE_A };

  it('resolves the account and device behind a valid access token', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow());

    const session = await authService.verifyToken(await signToken('access', subject));

    expect(session.user.id).toBe(subject.id);
    expect(session.deviceId).toBe(DEVICE_A);
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

  it('refuses a token whose device the account has since left', async () => {
    // The whole point of the scheme. The token is intact, unexpired and
    // correctly signed; it is simply bound to a device this account moved off
    // when it signed in somewhere else.
    prisma.user.findUnique.mockResolvedValue(userRow({ deviceId: DEVICE_B }));

    const error = await rejection(async () =>
      authService.verifyToken(await signToken('access', subject))
    );

    expect(error.status).toBe(401);
    // A distinct code from an ordinary expiry, because the client must not
    // answer it by refreshing — the refresh token is bound to the same dead
    // device and would fail the identical check.
    expect(error.code).toBe('DEVICE_MISMATCH');
  });

  it('refuses a token for an account holding no device at all', async () => {
    // Reachable by re-seeding, or by an admin clearing the column. `null` is
    // not equal to any signed `did`, so every outstanding token stops working —
    // which is the correct reading of "this account holds no session".
    prisma.user.findUnique.mockResolvedValue(userRow({ deviceId: null }));

    const error = await rejection(async () =>
      authService.verifyToken(await signToken('access', subject))
    );

    expect(error.code).toBe('DEVICE_MISMATCH');
  });

  it('checks the device before the active flag', async () => {
    // Both are 401/403 dead ends, but only the device verdict tells the client
    // not to bother refreshing, so it has to be the one that surfaces.
    prisma.user.findUnique.mockResolvedValue(userRow({ deviceId: DEVICE_B, isActive: false }));

    const error = await rejection(async () =>
      authService.verifyToken(await signToken('access', subject))
    );

    expect(error.code).toBe('DEVICE_MISMATCH');
  });
});

describe('refresh', () => {
  const subject = { id: userRow().id as string, role: 'STUDENT' as const, deviceId: DEVICE_A };

  it('rotates both tokens, not just the access one', async () => {
    // A captured refresh token then has a useful life measured in minutes
    // rather than the week its expiry allows.
    prisma.user.findUnique.mockResolvedValue(userRow());

    const original = await signToken('refresh', subject);
    const { tokens } = await authService.refresh(original);

    expect(tokens.refreshToken).toBeTypeOf('string');
    expect(tokens.accessToken).not.toBe(tokens.refreshToken);
  });

  it('keeps the session on the device it was already bound to', async () => {
    // A refresh is not a login: it carries no device of its own and must not be
    // able to move an account to one, or a stolen refresh token would be a way
    // to take the session over rather than merely to borrow it.
    prisma.user.findUnique.mockResolvedValue(userRow());

    const result = await authService.refresh(await signToken('refresh', subject));

    expect(prisma.user.update.mock.calls[0]![0].data.deviceId).toBe(DEVICE_A);
    expect(result.revokedDeviceId).toBeNull();
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

  it('refuses to refresh a session the account has moved off', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow({ deviceId: DEVICE_B }));

    const error = await rejection(async () =>
      authService.refresh(await signToken('refresh', subject))
    );

    expect(error.code).toBe('DEVICE_MISMATCH');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
