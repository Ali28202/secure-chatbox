'use client';

import type { UserSummaryDto } from '@repo/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const userDirectoryQueryKey = (search: string) => ['users', search] as const;

/**
 * The people directory behind the new-chat picker.
 *
 * `keepPreviousData` is what stops the list from collapsing to a spinner
 * between keystrokes: the previous results stay on screen, dimmed, while the
 * next ones load. A list that empties and refills on every search term is
 * unusable at typing speed.
 *
 * `staleTime` of a minute because a university roster does not change while
 * someone picks a name out of it.
 */
export function useUserDirectory(search: string) {
  return useQuery({
    queryKey: userDirectoryQueryKey(search),
    queryFn: async () =>
      (await api.get<UserSummaryDto[]>('/users', { params: search ? { search } : undefined })).data,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
