'use client';

import type { UserSummaryDto } from '@repo/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarUrl } from '@/lib/api';
import { getInitials } from '@/lib/labels';
import { cn } from '@/lib/utils';

/**
 * One place that knows how an avatar is fetched.
 *
 * The DTO carries `hasAvatar`, not a URL: a signed URL expires, and these DTOs
 * live in a query cache for as long as the tab is open. The redirect route
 * signs a fresh one per request instead.
 */
export function UserAvatar({
  user,
  className,
}: {
  user: Pick<UserSummaryDto, 'id' | 'name' | 'hasAvatar'>;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-8', className)}>
      {user.hasAvatar && (
        <AvatarImage
          src={avatarUrl(user.id)}
          alt=""
          // The route needs the session cookie, and in development the API is a
          // different origin from the page, where an image request sends none
          // unless it is explicitly credentialed. Same origin in production, so
          // this costs nothing there.
          crossOrigin="use-credentials"
        />
      )}
      <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
    </Avatar>
  );
}
