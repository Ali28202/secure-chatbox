import { QueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

/**
 * Retries only what retrying can fix.
 *
 * A 4xx is the server saying "your request is wrong" — not logged in, not a
 * member of that chat, no such message. Sending it again unchanged produces the
 * same answer, so react-query's default of three attempts just triples the
 * latency before the user sees the error. 5xx and network failures are the
 * opposite: those are worth a second look, especially on Wi-Fi.
 *
 * 401 is excluded on purpose too — the axios interceptor already refreshes and
 * replays once. If it still comes back 401 the session really is over.
 */
function retryOnlyTransient(failureCount: number, error: Error): boolean {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 2;
}

/**
 * One client per browser tab, created inside a component so a server render
 * never shares cached data between two users' requests.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Realtime updates arrive over the socket (M8), so aggressive polling
        // would only duplicate work. Half a minute is enough to keep tab
        // switches instant without serving visibly stale data before then.
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: retryOnlyTransient,
      },
      mutations: {
        // Sending a message twice because the response was slow is worse than
        // showing an error the user can act on.
        retry: false,
      },
    },
  });
}
