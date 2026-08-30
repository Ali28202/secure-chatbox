import { QueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

function retryOnlyTransient(failureCount: number, error: Error): boolean {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: retryOnlyTransient,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
