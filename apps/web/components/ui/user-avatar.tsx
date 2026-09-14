'use client';

import type { UserSummaryDto } from '@repo/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarUrl } from '@/lib/api';
import { getInitials } from '@/lib/labels';
import { cn } from '@/lib/utils';

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
        <AvatarImage src={avatarUrl(user.id)} alt="" crossOrigin="use-credentials" />
      )}
      <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
    </Avatar>
  );
}
