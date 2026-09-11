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

const INVALID_CREDENTIALS = 'شناسه یا گذرواژه نادرست است.';
const ACCOUNT_DISABLED = 'حساب کاربری شما غیرفعال شده است. با مدیر سامانه تماس بگیرید.';
const SESSION_INVALID = 'نشست شما معتبر نیست یا منقضی شده است. دوباره وارد شوید.';
const DEVICE_MISMATCH =
  'حساب شما روی دستگاه دیگری وارد شده است. برای ادامه، دوباره از همین دستگاه وارد شوید.';

export interface AuthResult {
  user: UserDto;
  tokens: AuthTokens;
  revokedDeviceId: string | null;
}

export interface VerifiedSession {
  user: UserRow;
  deviceId: string;
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
          ? 'این شماره دانشجویی قبلاً ثبت شده است.'
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

    return this.issueSession(user, input.deviceId);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const { user, deviceId } = await this.verifyToken(refreshToken, 'refresh');
    return this.issueSession(user, deviceId);
  }

  async verifyToken(token: string, type: TokenType = 'access'): Promise<VerifiedSession> {
    const payload = await verifyJwt(type, token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: userSelect,
    });

    if (!user) {
      throw Errors.unauthorized(SESSION_INVALID);
    }

    if (user.deviceId !== payload.did) {
      throw Errors.deviceMismatch(DEVICE_MISMATCH);
    }

    if (!user.isActive) {
      throw Errors.forbidden(ACCOUNT_DISABLED);
    }

    return { user, deviceId: payload.did };
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

  private async issueSession(user: UserRow, deviceId: string): Promise<AuthResult> {
    const current = await prisma.user.update({
      where: { id: user.id },
      data: { lastSeen: new Date(), deviceId },
      select: userSelect,
    });

    return {
      user: toUserDto(current),
      tokens: await signAuthTokens({ id: current.id, role: current.role, deviceId }),
      revokedDeviceId: user.deviceId !== null && user.deviceId !== deviceId ? user.deviceId : null,
    };
  }

  private hashPassword(password: string): Promise<string> {
    return argon2id(password);
  }
}

export const authService = new AuthService();
