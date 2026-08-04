/**
 * The contract between `apps/api` and `apps/web`.
 *
 * Everything here is runtime-agnostic — no Prisma, no Hono, no React — so both
 * sides can import it without pulling the other's dependencies along.
 */

// Side-effect import: puts Zod's built-in messages into Persian before any
// schema below is ever parsed. Must stay first.
import './locale';

export * from './constants';
export * from './messages';

export * from './schemas/auth';
export * from './schemas/chat';
export * from './schemas/common';
export * from './schemas/message';

export * from './types/api';
export type * from './types/dto';
