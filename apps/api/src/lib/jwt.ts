import type { GlobalRole } from '@repo/shared';
import { sign, verify } from 'hono/jwt';
import type { JWTPayload } from 'hono/utils/jwt/types';
import { env } from '../env';
import { Errors } from './errors';

/**
 * Token signing and verification.
 *
 * Two token types with two different jobs: a short-lived **access** token that
 * accompanies every request, and a long-lived **refresh** token that exists
 * only to mint new access tokens. Keeping the first one short is what limits
 * the damage if it leaks, since (by the stateless design recorded in the plan)
 * there is no server-side revocation list.
 */

/**
 * HMAC-SHA256. Passed explicitly on *verify* as well as sign — `verify` will
 * otherwise trust the `alg` field in the token's own header, and an attacker
 * who controls that field controls which algorithm validates their signature.
 * That is the classic JWT algorithm-confusion attack.
 */
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
  /** The user id. */
  sub: string;
  role: GlobalRole;
  /** Which of the two token types this is. */
  typ: TokenType;
  iat: number;
  exp: number;
}

/** The claims subject a token is issued for. */
export interface TokenSubject {
  id: string;
  role: GlobalRole;
}

export function signToken(type: TokenType, subject: TokenSubject): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);

  const payload: AuthTokenPayload = {
    sub: subject.id,
    role: subject.role,
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

/**
 * Verifies a token *and* that it is the type the caller expected.
 *
 * The two are separate defences and both are needed. Distinct secrets already
 * stop a refresh token from validating as an access token — but the `typ`
 * claim keeps that guarantee even if the two secrets are ever accidentally set
 * to the same value in a `.env`, which is exactly the kind of deployment slip
 * nobody notices because everything still works.
 *
 * Every failure — malformed, expired, wrong signature, wrong type — comes back
 * as the same 401. Telling a caller *why* their token was rejected only helps
 * someone probing it.
 */
export async function verifyToken(type: TokenType, token: string): Promise<AuthTokenPayload> {
  let payload: JWTPayload;

  try {
    payload = await verify(token, SECRETS[type], { alg: ALGORITHM });
  } catch {
    throw Errors.unauthorized('نشست شما معتبر نیست یا منقضی شده است. دوباره وارد شوید.');
  }

  if (payload.typ !== type || typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
    throw Errors.unauthorized('نشست شما معتبر نیست یا منقضی شده است. دوباره وارد شوید.');
  }

  return payload as AuthTokenPayload;
}
