'use client';

import type { UserSummaryDto } from '@repo/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const userDirectoryQueryKey = (search: string) => ['users', search] as const;

export function useUserDirectory(search: string) {
  return useQuery({
    queryKey: userDirectoryQueryKey(search),
    queryFn: async () =>
      (await api.get<UserSummaryDto[]>('/users', { params: search ? { search } : undefined })).data,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
