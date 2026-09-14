import { prisma } from '@repo/database';
import {
  normalizePhoneNumber,
  type AccountStatus,
  type LoginInput,
  type RegisterInput,
  type UserDto,
} from '@repo/shared';
import type { AuthTokens } from '../../lib/cookies';
import { Errors } from '../../lib/errors';
import { signAuthTokens, verifyToken as verifyJwt, type TokenType } from '../../lib/jwt';
import {
  toUserDto,
  userSelect,
  sessionSelect,
  type SessionRow,
  type UserRow,
} from '../../lib/mappers';
import { env } from '../../env';
import {
  consumeVerificationTime,
  hashPassword as argon2id,
  verifyPassword,
} from '../../lib/password';

const INVALID_CREDENTIALS = 'شناسه یا گذرواژه درست نیست.';
const ACCOUNT_DISABLED = 'حسابت غیرفعال شده. با مدیر سامانه تماس بگیر.';
const ACCOUNT_PENDING = 'حسابت هنوز تأیید نشده. وقتی مدیر سامانه تأییدش کرد می‌تونی وارد شی.';
const ACCOUNT_REJECTED = 'درخواست حسابت پذیرفته نشده. با مدیر سامانه تماس بگیر.';
const SESSION_INVALID = 'نشستت معتبر نیست یا تموم شده. دوباره وارد شو.';
const DEVICE_MISMATCH = 'حسابت روی یه دستگاه دیگه وارد شده. برای ادامه، دوباره از همین‌جا وارد شو.';

function assertApproved(status: AccountStatus): void {
  if (status === 'APPROVED') return;

  throw Errors.forbidden(status === 'REJECTED' ? ACCOUNT_REJECTED : ACCOUNT_PENDING);
}

export interface AuthResult {
  user: UserDto;
  tokens: AuthTokens;
  revokedDeviceId: string | null;
}

export interface VerifiedSession {
  user: UserRow;
  deviceId: string;
  sessionId: string;
}

export interface SessionContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

class AuthService {
  async register(input: RegisterInput): Promise<UserDto> {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ universityId: input.universityId }, { phoneNumber: input.phoneNumber }] },
      select: { universityId: true },
    });

    if (existing) {
      throw Errors.conflict(
        existing.universityId === input.universityId
          ? 'این شماره دانشجویی قبلاً ثبت شده.'
          : 'این شمارهٔ تلفن قبلاً ثبت شده.'
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

  async login(input: LoginInput, context: SessionContext = {}): Promise<AuthResult> {
    const record = await this.findByIdentifier(input.identifier);

    if (!record) {
      await consumeVerificationTime(input.password);
      throw Errors.unauthorized(INVALID_CREDENTIALS);
    }

    const { passwordHash, ...user } = record;

    if (!(await verifyPassword(input.password, passwordHash))) {
      throw Errors.unauthorized(INVALID_CREDENTIALS);
    }

    if (!user.isActive) {
      throw Errors.forbidden(ACCOUNT_DISABLED);
    }

    assertApproved(user.status);

    return this.issueSession(user, input.deviceId, context);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const { user, deviceId, sessionId } = await this.verifyToken(refreshToken, 'refresh');

    await prisma.session.update({
      where: { id: sessionId },
      data: { lastUsedAt: new Date(), expiresAt: this.sessionExpiry() },
    });

    const current = await prisma.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date() },
      select: userSelect,
    });

    return {
      user: toUserDto(current),
      tokens: await signAuthTokens({
        id: current.id,
        role: current.role,
        deviceId,
        sessionId,
      }),
      revokedDeviceId: null,
    };
  }

  async listSessions(userId: string): Promise<SessionRow[]> {
    return prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: sessionSelect,
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async revokeSessions(
    userId: string,
    options: { sessionId?: string; exceptSessionId?: string }
  ): Promise<string[]> {
    const targets = await prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(options.sessionId ? { id: options.sessionId } : {}),
        ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}),
      },
      select: { id: true, deviceId: true },
    });

    if (targets.length === 0) return [];

    await prisma.session.updateMany({
      where: { id: { in: targets.map((session) => session.id) } },
      data: { revokedAt: new Date() },
    });

    return targets.map((session) => session.deviceId);
  }

  async verifyToken(token: string, type: TokenType = 'access'): Promise<VerifiedSession> {
    const payload = await verifyJwt(type, token);

    const session = await prisma.session.findUnique({
      where: { id: payload.sid },
      select: { id: true, revokedAt: true, expiresAt: true, user: { select: userSelect } },
    });

    if (!session || session.user.id !== payload.sub) {
      throw Errors.unauthorized(SESSION_INVALID);
    }

    const { user } = session;

    if (user.deviceId !== payload.did) {
      throw Errors.deviceMismatch(DEVICE_MISMATCH);
    }

    if (session.revokedAt !== null || session.expiresAt <= new Date()) {
      throw Errors.unauthorized(SESSION_INVALID);
    }

    if (!user.isActive) {
      throw Errors.forbidden(ACCOUNT_DISABLED);
    }

    assertApproved(user.status);

    return { user, deviceId: payload.did, sessionId: session.id };
  }

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

  private sessionExpiry(): Date {
    return new Date(Date.now() + env.REFRESH_TOKEN_TTL * 1000);
  }

  private async issueSession(
    user: UserRow,
    deviceId: string,
    context: SessionContext
  ): Promise<AuthResult> {
    const { current, session } = await prisma.$transaction(async (tx) => {
      const existing = await tx.session.findFirst({
        where: { userId: user.id, deviceId, revokedAt: null },
        select: { id: true },
      });

      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null, deviceId: { not: deviceId } },
        data: { revokedAt: new Date() },
      });

      const fields = {
        userAgent: context.userAgent?.slice(0, 256) ?? null,
        ipAddress: context.ipAddress?.slice(0, 64) ?? null,
        expiresAt: this.sessionExpiry(),
      };

      const created = existing
        ? await tx.session.update({
            where: { id: existing.id },
            data: { ...fields, lastUsedAt: new Date() },
            select: { id: true },
          })
        : await tx.session.create({
            data: { userId: user.id, deviceId, ...fields },
            select: { id: true },
          });

      const updated = await tx.user.update({
        where: { id: user.id },
        data: { lastSeen: new Date(), deviceId },
        select: userSelect,
      });

      return { current: updated, session: created };
    });

    return {
      user: toUserDto(current),
      tokens: await signAuthTokens({
        id: current.id,
        role: current.role,
        deviceId,
        sessionId: session.id,
      }),
      revokedDeviceId: user.deviceId !== null && user.deviceId !== deviceId ? user.deviceId : null,
    };
  }

  private hashPassword(password: string): Promise<string> {
    return argon2id(password);
  }
}

export const authService = new AuthService();
