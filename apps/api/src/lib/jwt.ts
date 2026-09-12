import type { GlobalRole } from '@repo/shared';
import { sign, verify } from 'hono/jwt';
import type { JWTPayload } from 'hono/utils/jwt/types';
import { env } from '../env';
import { Errors } from './errors';

const ALGORITHM = 'HS256' as const;

export type TokenType = 'access' | 'refresh';

const SECRETS: Record<TokenType, string> = {
  access: env.JWT_ACCESS_SECRET,
  refresh: env.JWT_REFRESH_SECRET,
};

const TTLS: Record<TokenType, number> = {
  access: env.ACCESS_TOKEN_TTL,
  refresh: env.REFRESH_TOKEN_TTL,
};

export interface AuthTokenPayload extends JWTPayload {
  sub: string;
  role: GlobalRole;
  did: string;
  /** Session id. The row it names is what makes this token revocable. */
  sid: string;
  typ: TokenType;
  iat: number;
  exp: number;
}

export interface TokenSubject {
  id: string;
  role: GlobalRole;
  deviceId: string;
  sessionId: string;
}

export function signToken(type: TokenType, subject: TokenSubject): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);

  const payload: AuthTokenPayload = {
    sub: subject.id,
    role: subject.role,
    did: subject.deviceId,
    sid: subject.sessionId,
    typ: type,
    iat: issuedAt,
    exp: issuedAt + TTLS[type],
  };

  return sign(payload, SECRETS[type], ALGORITHM);
}

export async function signAuthTokens(subject: TokenSubject) {
  const [accessToken, refreshToken] = await Promise.all([
    signToken('access', subject),
    signToken('refresh', subject),
  ]);

  return { accessToken, refreshToken };
}

export async function verifyToken(type: TokenType, token: string): Promise<AuthTokenPayload> {
  let payload: JWTPayload;

  try {
    payload = await verify(token, SECRETS[type], { alg: ALGORITHM });
  } catch {
    throw Errors.unauthorized('نشست شما معتبر نیست یا منقضی شده است. دوباره وارد شوید.');
  }

  if (
    payload.typ !== type ||
    typeof payload.sub !== 'string' ||
    typeof payload.role !== 'string' ||
    typeof payload.did !== 'string' ||
    typeof payload.sid !== 'string'
  ) {
    throw Errors.unauthorized('نشست شما معتبر نیست یا منقضی شده است. دوباره وارد شوید.');
  }

  return payload as AuthTokenPayload;
}
