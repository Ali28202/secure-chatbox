import { prisma } from '@repo/database';
import type { UserSearchInput, UserSummaryDto } from '@repo/shared';
import { toUserSummaryDto, userSummarySelect } from '../../lib/mappers';

/**
 * The people directory behind the new-chat picker.
 *
 * It is deliberately not a general user API: it returns `UserSummaryDto`, which
 * carries no `lastSeen` and no `isActive`, so browsing the directory tells you
 * who you may write to and nothing about their habits.
 */
class UserService {
  /**
   * Active users other than the caller, newest sessions first is *not* the
   * order — alphabetical is, because a picker is scanned by name.
   *
   * `mode: 'insensitive'` earns its keep on `universityId` (Persian has no
   * letter case, but student numbers can be typed with either); the name match
   * is a plain substring, which is what someone typing «رضا» expects to hit
   * inside «علی‌رضا».
   */
  async search(viewerId: string, { search, limit }: UserSearchInput): Promise<UserSummaryDto[]> {
    const users = await prisma.user.findMany({
      where: {
        id: { not: viewerId },
        isActive: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { universityId: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: userSummarySelect,
      orderBy: { name: 'asc' },
      take: limit,
    });

    return users.map(toUserSummaryDto);
  }
}

export const userService = new UserService();
