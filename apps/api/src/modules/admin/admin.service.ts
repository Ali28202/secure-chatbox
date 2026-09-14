import { prisma } from '@repo/database';
import type { AdminUpdateUserInput, AdminUserDto, AdminUserQuery } from '@repo/shared';
import { Errors } from '../../lib/errors';
import { adminUserSelect, toAdminUserDto } from '../../lib/mappers';

class AdminService {
  async listUsers(query: AdminUserQuery): Promise<{ users: AdminUserDto[]; total: number }> {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { universityId: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: adminUserSelect,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: query.limit,
      }),
      prisma.user.count({ where }),
    ]);

    return { users: users.map(toAdminUserDto), total };
  }

  async countPending(): Promise<number> {
    return prisma.user.count({ where: { status: 'PENDING' } });
  }

  async updateUser(
    actorId: string,
    userId: string,
    input: AdminUpdateUserInput
  ): Promise<AdminUserDto> {
    if (actorId === userId) {
      throw Errors.forbidden('حساب خودت رو از اینجا نمی‌تونی عوض کنی.');
    }

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });

    if (!target) {
      throw Errors.notFound('همچین کاربری نیست.');
    }

    const reviewed = input.status !== undefined;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(reviewed
          ? { status: input.status, reviewedAt: new Date(), reviewedById: actorId }
          : {}),
      },
      select: adminUserSelect,
    });

    if (input.status === 'REJECTED' || input.isActive === false) {
      await prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return toAdminUserDto(updated);
  }
}

export const adminService = new AdminService();
