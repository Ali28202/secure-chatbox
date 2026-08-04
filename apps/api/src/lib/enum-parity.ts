import type {
  ChatRole as PrismaChatRole,
  ChatType as PrismaChatType,
  GlobalRole as PrismaGlobalRole,
  ReceiptStatus as PrismaReceiptStatus,
} from '@repo/database';
import type {
  ChatRole as SharedChatRole,
  ChatType as SharedChatType,
  GlobalRole as SharedGlobalRole,
  ReceiptStatus as SharedReceiptStatus,
} from '@repo/shared';

/**
 * `@repo/shared` re-declares the Prisma enums as plain string unions, because
 * `apps/web` must never import `@repo/database`. This file is the seam where
 * both are visible at once, and it fails typecheck the moment they disagree.
 *
 * Nothing imports it — `tsc` checks every file under `src/`, so a drift shows
 * up as a build error the next time anyone runs `bun run typecheck`, which is
 * the only place this check could live without dragging Prisma somewhere it
 * does not belong.
 *
 * Nothing here survives compilation; these are types only.
 */

/** `false` rather than `never` on mismatch — `never extends true` would pass. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Assert<T extends true> = T;

export type GlobalRoleParity = Assert<Exact<PrismaGlobalRole, SharedGlobalRole>>;
export type ChatTypeParity = Assert<Exact<PrismaChatType, SharedChatType>>;
export type ChatRoleParity = Assert<Exact<PrismaChatRole, SharedChatRole>>;
export type ReceiptStatusParity = Assert<Exact<PrismaReceiptStatus, SharedReceiptStatus>>;
