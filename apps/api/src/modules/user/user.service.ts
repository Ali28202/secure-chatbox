import { prisma } from '@repo/database';
import type { UserDto, UserSearchInput, UserSummaryDto } from '@repo/shared';
import { toUserDto, toUserSummaryDto, userSelect, userSummarySelect } from '../../lib/mappers';
import { s3Storage } from '../../lib/s3';
import { removeStored, storeAvatar } from '../../lib/storage';

/** Reverse of the name `storeAvatar` writes. Falls back to PNG, never to a
 *  generic type: a wrong image type still renders, `octet-stream` downloads. */
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

  /** Replaces the avatar and removes whatever it displaced from the bucket. */
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

    // After the row is committed, never before: a delete that ran first would
    // leave the account pointing at an object that no longer exists if the
    // update then failed.
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

  /**
   * The avatar's bytes, or null.
   *
   * Any signed-in person may see any member's: the directory already lists
   * every name, so a picture beside one reveals nothing the picker did not.
   * Served through the API rather than as a redirect because an `<img>` is a
   * subresource — see `s3Storage.readFile`.
   */
  async readAvatar(userId: string): Promise<{ bytes: ArrayBuffer; type: string } | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });

    if (!user?.avatarKey) return null;

    const file = await s3Storage.readFile(user.avatarKey);
    if (!file) return null;

    // The type comes from the key, not from the store. `storeAvatar` builds the
    // object name as `avatar<ext>` from a MIME type it has already validated,
    // so the extension is ours and exact — while the bucket answered
    // `application/octet-stream`, which no browser will render as an image.
    return { bytes: file.bytes, type: avatarTypeOf(user.avatarKey) };
  }
}

export const userService = new UserService();
