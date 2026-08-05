'use client';

import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { useSession } from '@/hooks/use-auth';
import { ROUTES } from '@/lib/routes';

/**
 * The authenticated shell, and the second half of route protection.
 *
 * `proxy.ts` already turned away anyone with no session cookie, but that check
 * is a hint — it verifies nothing. This is where the claim is actually tested:
 * the session query asks the API who you are, and the API checks the signature
 * and re-reads the account. Everything below only renders once that answered.
 *
 * A session that fails here has already been through the axios interceptor's
 * refresh attempt, so an error means the session is genuinely over — most often
 * a forged or stale hint cookie, or an account disabled since the last request.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.isError) router.replace(ROUTES.login);
  }, [session.isError, router]);

  if (!session.isSuccess) {
    return (
      <div className="flex flex-1 items-center justify-center" aria-busy>
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">در حال بارگذاری…</span>
      </div>
    );
  }

  /*
   * The shell is exactly one screen tall and never scrolls itself; the pages
   * inside it scroll their own content. That is what a conversation needs — the
   * composer has to stay reachable while the history moves behind it — and it
   * has to be settled here, because a scroll region can only be as tall as an
   * ancestor with a real height.
   *
   * `min-h-0` on the content row is the other half: a flex child defaults to
   * `min-height: auto`, which refuses to shrink below its content, so without
   * it a long conversation would push the composer off the bottom of the screen
   * instead of scrolling.
   *
   * `svh` rather than `vh` because mobile browsers count their collapsing
   * address bar in `vh`, and a composer that hides under it is worse than one
   * that sits a little high.
   */
  return (
    <div className="flex h-svh flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col px-4 py-6">
        {children}
      </div>
    </div>
  );
}
