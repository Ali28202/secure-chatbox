import type { Prisma } from '@repo/database';
import type { UserDto, UserSummaryDto } from '@repo/shared';

/**
 * Row → DTO translation, and the `select` clauses that produce those rows.
 *
 * The two belong together: the select is what guarantees `passwordHash` is
 * never even read out of the database on a normal request, and the mapper is
 * what guarantees the shape matches the contract in `@repo/shared`. Splitting
 * them across files is how a column quietly starts leaking.
 */

export const userSummarySelect = {
  id: true,
  name: true,
  universityId: true,
  role: true,
} satisfies Prisma.UserSelect;

export const userSelect = {
  ...userSummarySelect,
  isActive: true,
  lastSeen: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type UserSummaryRow = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;
export type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export function toUserSummaryDto(user: UserSummaryRow): UserSummaryDto {
  return {
    id: user.id,
    name: user.name,
    universityId: user.universityId,
    role: user.role,
  };
}

export function toUserDto(user: UserRow): UserDto {
  return {
    ...toUserSummaryDto(user),
    isActive: user.isActive,
    lastSeen: user.lastSeen?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
