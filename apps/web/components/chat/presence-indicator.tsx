'use client';

import { toPersianDigits } from '@repo/shared';
import { cn } from '@/lib/utils';
import { useIsOnline, usePresenceStore } from '@/stores/presence-store';

export function PresenceDot({ userId, className }: { userId: string; className?: string }) {
  const isOnline = useIsOnline(userId);
  if (!isOnline) return null;

  return (
    <span
      className={cn(
        'absolute inset-e-0 bottom-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background',
        className
      )}
      role="status"
      aria-label="آنلاین"
    />
  );
}

export function PresenceLabel({ userIds, fallback }: { userIds: string[]; fallback: string }) {
  const online = usePresenceStore(
    (state) => userIds.filter((userId) => state.online.has(userId)).length
  );

  if (online === 0) return fallback;
  if (userIds.length === 1) return <span className="text-emerald-600">آنلاین</span>;

  return <span className="text-emerald-600">{toPersianDigits(online)} نفر آنلاین</span>;
}
