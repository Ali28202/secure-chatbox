'use client';

import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { RealtimeBridge } from '@/components/realtime/realtime-bridge';
import { SessionContext, useSession } from '@/hooks/use-auth';
import { ROUTES } from '@/lib/routes';

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

  return (
    <SessionContext value={session.data}>
      <div className="flex h-svh flex-col">
        <RealtimeBridge />
        <AppHeader />
        <div className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col px-4 py-6">
          {children}
        </div>
      </div>
    </SessionContext>
  );
}
