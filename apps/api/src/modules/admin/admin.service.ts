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
        // Pending first: the list exists to be worked through, and the thing
        // waiting on a human should not be below the thing that is settled.
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

  /**
   * Changes a role, an approval, or an account's activity.
   *
   * Refuses to act on the caller. An admin who could demote or disable
   * themselves could leave the deployment with no administrator at all, and
   * nothing inside the app could undo it — the same reasoning as the chat-level
   * rule in `policy.ts`, one level up.
   */
  async updateUser(
    actorId: string,
    userId: string,
    input: AdminUpdateUserInput
  ): Promise<AdminUserDto> {
    if (actorId === userId) {
      throw Errors.forbidden('نمی‌توانید حساب خودتان را از این بخش تغییر دهید.');
    }

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });

    if (!target) {
      throw Errors.notFound('این کاربر وجود ندارد.');
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

    // A rejected or disabled account keeps working until its sessions are gone,
    // so the decision is only real once they are.
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
