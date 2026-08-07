'use client';

import { toPersianDigits } from '@repo/shared';
import { cn } from '@/lib/utils';
import { useIsOnline, usePresenceStore } from '@/stores/presence-store';

/**
 * The dot on an avatar.
 *
 * Absolutely positioned over the avatar rather than beside it, so a row's
 * layout does not change when someone connects — a list that reflows every time
 * a classmate opens the app is worse than one with no presence at all. The
 * caller supplies the `relative` wrapper.
 *
 * `end-0`, not `right-0`: in RTL the avatar's trailing edge is on the left.
 */
export function PresenceDot({ userId, className }: { userId: string; className?: string }) {
  const isOnline = useIsOnline(userId);
  if (!isOnline) return null;

  return (
    <span
      className={cn(
        'absolute end-0 bottom-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background',
        className
      )}
      // Labelled, because the meaning is carried entirely by a colour otherwise
      // — which is nothing to a screen reader, and nothing to anyone who cannot
      // tell this green from the grey background it sits on.
      role="status"
      aria-label="آنلاین"
    />
  );
}

/**
 * The status line under a chat's title: whether the other person is here, or
 * how many of a group are.
 *
 * The fallback is a prop rather than something the caller renders when this
 * returns `null`, because whether anyone is online is only known *inside* the
 * subscription — a caller cannot branch on it without subscribing too.
 * "۰ نفر آنلاین" would be a worse line than the chat type it replaced.
 */
export function PresenceLabel({ userIds, fallback }: { userIds: string[]; fallback: string }) {
  // Selecting the count rather than the Set: this re-renders when the number
  // changes, not every time anyone anywhere connects.
  const online = usePresenceStore(
    (state) => userIds.filter((userId) => state.online.has(userId)).length
  );

  if (online === 0) return fallback;
  if (userIds.length === 1) return <span className="text-emerald-600">آنلاین</span>;

  return <span className="text-emerald-600">{toPersianDigits(online)} نفر آنلاین</span>;
}
