import { prisma } from '@repo/database';
import type { LoginInput, RegisterInput, UserDto } from '@repo/shared';
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
const INVALID_CREDENTIALS = 'شناسهٔ دانشگاهی یا گذرواژه نادرست است.';
const ACCOUNT_DISABLED = 'حساب کاربری شما غیرفعال شده است. با مدیر سامانه تماس بگیرید.';
const SESSION_INVALID = 'نشست شما معتبر نیست یا منقضی شده است. دوباره وارد شوید.';

export interface AuthResult {
  user: UserDto;
  tokens: AuthTokens;
}

/**
 * Authentication, as the class diagram describes it: `register`, `login`,
 * `verifyToken`, and a private `hashPassword`.
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
    const existing = await prisma.user.findUnique({
      where: { universityId: input.universityId },
      select: { id: true },
    });

    if (existing) {
      throw Errors.conflict('این شناسهٔ دانشگاهی قبلاً ثبت شده است.');
    }

    const user = await prisma.user.create({
      data: {
        universityId: input.universityId,
        name: input.name,
        passwordHash: await this.hashPassword(input.password),
        role: 'STUDENT',
      },
      select: userSelect,
    });

    return toUserDto(user);
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const record = await prisma.user.findUnique({
      where: { universityId: input.universityId },
      select: { ...userSelect, passwordHash: true },
    });

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

    return this.issueSession(user);
  }

  /**
   * Exchanges a refresh token for a fresh pair. Both tokens are replaced, not
   * just the access one: rotating on every use means a captured refresh token
   * has a useful life measured in minutes rather than a week.
   */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const user = await this.verifyToken(refreshToken, 'refresh');
    return this.issueSession(user);
  }

  /**
   * Verifies a token and resolves the account behind it.
   *
   * The database lookup is the point: a token stays cryptographically valid
   * until it expires, so without re-reading the user on every request, an
   * account disabled by an admin would keep working for the rest of the access
   * token's lifetime.
   */
  async verifyToken(token: string, type: TokenType = 'access'): Promise<UserRow> {
    const payload = await verifyJwt(type, token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: userSelect,
    });

    if (!user) {
      throw Errors.unauthorized(SESSION_INVALID);
    }

    if (!user.isActive) {
      throw Errors.forbidden(ACCOUNT_DISABLED);
    }

    return user;
  }

  /** Stamps `lastSeen` and mints a token pair for an already-verified user. */
  private async issueSession(user: UserRow): Promise<AuthResult> {
    const current = await prisma.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date() },
      select: userSelect,
    });

    return {
      user: toUserDto(current),
      tokens: await signAuthTokens(current),
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
