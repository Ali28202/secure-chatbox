'use client';

import type { AccountStatus, AdminUserDto, AdminUsersDto, GlobalRole } from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const adminUsersKey = (filter: { status?: AccountStatus; search?: string }) =>
  ['admin', 'users', filter] as const;
export const pendingCountKey = ['admin', 'pending-count'] as const;

export function useAdminUsers(filter: { status?: AccountStatus; search?: string }) {
  return useQuery({
    queryKey: adminUsersKey(filter),
    queryFn: async () => (await api.get<AdminUsersDto>('/admin/users', { params: filter })).data,
  });
}

export function usePendingCount() {
  return useQuery({
    queryKey: pendingCountKey,
    queryFn: async () =>
      (await api.get<{ count: number }>('/admin/users/pending-count')).data.count,
    // Cheap by design, so the badge can stay roughly current without polling hard.
    refetchInterval: 60_000,
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      ...input
    }: {
      userId: string;
      role?: GlobalRole;
      status?: AccountStatus;
      isActive?: boolean;
    }) => (await api.patch<AdminUserDto>(`/admin/users/${userId}`, input)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}
