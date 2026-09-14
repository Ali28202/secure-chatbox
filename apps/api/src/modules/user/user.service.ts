import { prisma } from '@repo/database';
import type { UserDto, UserSearchInput, UserSummaryDto } from '@repo/shared';
import { toUserDto, toUserSummaryDto, userSelect, userSummarySelect } from '../../lib/mappers';
import { s3Storage } from '../../lib/s3';
import { removeStored, storeAvatar } from '../../lib/storage';

function avatarTypeOf(avatarKey: string): string {
  if (avatarKey.endsWith('.jpg')) return 'image/jpeg';
  if (avatarKey.endsWith('.webp')) return 'image/webp';

  return 'image/png';
}

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

  async setAvatar(userId: string, file: File): Promise<UserDto> {
    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });

    const avatarKey = await storeAvatar(file);

    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarKey },
      select: userSelect,
    });

    if (before?.avatarKey) await removeStored([before.avatarKey]);

    return toUserDto(user);
  }

  async clearAvatar(userId: string): Promise<UserDto> {
    const before = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarKey: null },
      select: userSelect,
    });

    if (before?.avatarKey) await removeStored([before.avatarKey]);

    return toUserDto(user);
  }

  async readAvatar(userId: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });

    if (!user?.avatarKey) return null;

    const file = await s3Storage.readFile(user.avatarKey);
    if (!file) return null;

    return { bytes: file.bytes, type: avatarTypeOf(user.avatarKey) };
  }
}

export const userService = new UserService();
