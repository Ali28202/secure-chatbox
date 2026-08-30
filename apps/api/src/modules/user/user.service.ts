import { prisma } from '@repo/database';
import type { UserSearchInput, UserSummaryDto } from '@repo/shared';
import { toUserSummaryDto, userSummarySelect } from '../../lib/mappers';

class UserService {
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
