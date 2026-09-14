'use client';

import { LIMITS, type MessageSearchResultsDto } from '@repo/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const searchQueryKey = (q: string) => ['search', q] as const;

export function useMessageSearch(q: string) {
  const trimmed = q.trim();

  return useQuery({
    queryKey: searchQueryKey(trimmed),
    queryFn: async () =>
      (await api.get<MessageSearchResultsDto>('/search', { params: { q: trimmed } })).data.hits,
    enabled: trimmed.length >= LIMITS.search.min,
    staleTime: 30_000,
  });
}
