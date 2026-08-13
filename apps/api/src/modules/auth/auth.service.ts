import { prisma } from '@repo/database';
import {
  normalizePhoneNumber,
  type LoginInput,
  type RegisterInput,
  type UserDto,
} from '@repo/shared';
import type { AuthTokens } from '../../lib/cookies';
import { Errors } from '../../lib/errors';
import { signAuthTokens, verifyToken as verifyJwt, type TokenType } from '../../lib/jwt';
import { toUserDto, userSelect, type UserRow } from '../../lib/mappers';
import {
  consumeVerificationTime,
  hashPassword as argon2id,
  verifyPassword,
} from '../../lib/password';

/**
 * One message for every way a login can fail on credentials — wrong password,
 * unknown identifier, typo in either. Distinguishing them would tell an
 * attacker which student numbers exist, which is the same thing the dummy-hash
 * timing defence in `password.ts` exists to hide.
 */
const INVALID_CREDENTIALS = 'شناسه یا گذرواژه نادرست است.';
const ACCOUNT_DISABLED = 'حساب کاربری شما غیرفعال شده است. با مدیر سامانه تماس بگیرید.';
const SESSION_INVALID = 'نشست شما معتبر نیست یا منقضی شده است. دوباره وارد شوید.';
const DEVICE_MISMATCH =
  'حساب شما روی دستگاه دیگری وارد شده است. برای ادامه، دوباره از همین دستگاه وارد شوید.';

export interface AuthResult {
  user: UserDto;
  tokens: AuthTokens;
  /**
   * The device this login just displaced, if there was one.
   *
   * Half of "revoke the old sessions" happens by writing the new device id: the
   * old device's tokens still verify cryptographically but no longer match the
   * account, so their next request is a 401. The other half is the socket that
   * device already has open, which authenticated once at handshake and would
   * otherwise keep receiving messages for as long as it stayed connected.
   *
   * Reported rather than acted on, because closing sockets is the gateway's job
   * and the gateway sits above the service layer — see `auth.routes.ts`.
   */
  revokedDeviceId: string | null;
}

/** A token that passed every check, and the device it is bound to. */
export interface VerifiedSession {
  user: UserRow;
  deviceId: string;
}

/**
 * Authentication, as the class diagram describes it: `register`, `login`,
 * `verifyToken`, and the private `hashPassword` / `updateDeviceId` /
 * `revokeOldSessions`. The last two are one method here — see `issueSession`.
 *
 * It owns tokens and passwords but not cookies — the routes decide how a token
 * reaches the browser. That separation is what lets the Socket.io gateway (M8)
 * reuse `verifyToken` against a handshake header instead of a cookie jar.
 */
class AuthService {
  /**
   * Self-registration. Always produces a STUDENT; see `registerSchema` in
   * `@repo/shared` for why the role is not something the client can send.
   */
  async register(input: RegisterInput): Promise<UserDto> {
    // One query for two unique columns. Asking about them separately would be
    // two round trips and would still race — the create below is what actually
    // guarantees uniqueness; this exists to name the offending field.
    const existing = await prisma.user.findFirst({
      where: { OR: [{ universityId: input.universityId }, { phoneNumber: input.phoneNumber }] },
      select: { universityId: true },
    });

    if (existing) {
      throw Errors.conflict(
        existing.universityId === input.universityId
          ? 'این شناسهٔ دانشگاهی قبلاً ثبت شده است.'
          : 'این شمارهٔ تلفن قبلاً ثبت شده است.'
      );
    }

    const user = await prisma.user.create({
      data: {
        universityId: input.universityId,
        phoneNumber: input.phoneNumber,
        name: input.name,
        passwordHash: await this.hashPassword(input.password),
        role: 'STUDENT',
      },
      select: userSelect,
    });

    return toUserDto(user);
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const record = await this.findByIdentifier(input.identifier);

    if (!record) {
      // Spend the time a real verification would have, then fail identically.
      await consumeVerificationTime(input.password);
      throw Errors.unauthorized(INVALID_CREDENTIALS);
    }

    const { passwordHash, ...user } = record;

    if (!(await verifyPassword(input.password, passwordHash))) {
      throw Errors.unauthorized(INVALID_CREDENTIALS);
    }

    // Checked *after* the password, deliberately. Reporting "this account is
    // disabled" to someone who has not proven they own it would confirm the
    // account exists.
    if (!user.isActive) {
      throw Errors.forbidden(ACCOUNT_DISABLED);
    }

    return this.issueSession(user, input.deviceId);
  }

  /**
   * Exchanges a refresh token for a fresh pair. Both tokens are replaced, not
   * just the access one: rotating on every use means a captured refresh token
   * has a useful life measured in minutes rather than a week.
   *
   * The device is carried over from the token being spent rather than re-read
   * from the client. A refresh is not a login: it cannot move an account to a
   * new device, and it has already proved which device it belongs to by
   * surviving the check in `verifySession`.
   */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const { user, deviceId } = await this.verifyToken(refreshToken, 'refresh');
    return this.issueSession(user, deviceId);
  }

  /**
   * Verifies a token and resolves the session behind it — the account, and the
   * device that account is currently bound to. What `requireAuth` and the socket
   * handshake both call.
   *
   * The database lookup is the point: a token stays cryptographically valid
   * until it expires, so without re-reading the user on every request, an
   * account disabled by an admin — or a session displaced by a login from
   * another device — would keep working for the rest of the token's lifetime.
   */
  async verifyToken(token: string, type: TokenType = 'access'): Promise<VerifiedSession> {
    const payload = await verifyJwt(type, token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: userSelect,
    });

    if (!user) {
      throw Errors.unauthorized(SESSION_INVALID);
    }

    // The device gate. `did` is signed, so this compares the device the token
    // was minted for against the one device the account currently holds — and
    // the account only ever holds the most recent one. Every token issued to
    // any earlier device fails here, which is what "the last deviceId pops out"
    // means once the sessions themselves are stateless.
    if (user.deviceId !== payload.did) {
      throw Errors.deviceMismatch(DEVICE_MISMATCH);
    }

    if (!user.isActive) {
      throw Errors.forbidden(ACCOUNT_DISABLED);
    }

    return { user, deviceId: payload.did };
  }

  /**
   * Resolves what someone typed into the single login field.
   *
   * Both columns are unique, so at most two rows can match and `take: 2` is the
   * whole result set. When a university id happens to look like somebody else's
   * phone number, the university id wins — a fixed rule rather than whichever
   * row Postgres returned first, so the same input always reaches the same
   * account.
   */
  private async findByIdentifier(identifier: string) {
    const candidates = await prisma.user.findMany({
      where: {
        OR: [{ universityId: identifier }, { phoneNumber: normalizePhoneNumber(identifier) }],
      },
      select: { ...userSelect, passwordHash: true },
      take: 2,
    });

    return candidates.find((row) => row.universityId === identifier) ?? candidates[0] ?? null;
  }

  /**
   * Binds the account to this device, stamps `lastSeen`, and mints a pair.
   *
   * The class diagram's `updateDeviceId` and `revokeOldSessions` are the same
   * statement here, and that is the design rather than a shortcut: with
   * stateless JWTs and no session table, the column *is* the revocation list.
   * Writing a new value into it invalidates every token bound to the old one at
   * the next request, atomically, with nothing left to clean up.
   */
  private async issueSession(user: UserRow, deviceId: string): Promise<AuthResult> {
    const current = await prisma.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date(), deviceId },
      select: userSelect,
    });

    return {
      user: toUserDto(current),
      tokens: await signAuthTokens({ id: current.id, role: current.role, deviceId }),
      // Null on a refresh and on a repeat login from the same browser, which is
      // the overwhelmingly common case — there is nothing to evict when the
      // device has not changed.
      revokedDeviceId: user.deviceId !== null && user.deviceId !== deviceId ? user.deviceId : null,
    };
  }

  /**
   * Present because the class diagram specifies it, and useful for the same
   * reason a wrapper usually is: it is the one place the hashing cost would
   * change if argon2id's parameters ever need raising.
   */
  private hashPassword(password: string): Promise<string> {
    return argon2id(password);
  }
}

export const authService = new AuthService();
