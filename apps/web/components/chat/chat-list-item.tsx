'use client';

import { formatChatTimestamp, toPersianDigits, type ChatListItemDto } from '@repo/shared';
import { GraduationCapIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { PresenceDot } from '@/components/chat/presence-indicator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getChatPeer, getChatPreview, getChatTitle } from '@/lib/chat';
import { getInitials } from '@/lib/labels';
import { ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';

export function ChatListItem({
  chat,
  viewerId,
  isActive = false,
}: {
  chat: ChatListItemDto;
  viewerId: string;
  isActive?: boolean;
}) {
  const title = getChatTitle(chat, viewerId);
  const preview = getChatPreview(chat, viewerId);
  const timestamp = chat.lastMessage?.createdAt ?? chat.lastMessageAt;

  const peer = getChatPeer(chat, viewerId);

  return (
    <Link
      href={ROUTES.chat(chat.id)}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-accent',
        isActive && 'bg-accent'
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="size-10">
          <AvatarFallback className="text-sm">
            {chat.type === 'DIRECT' ? (
              getInitials(title)
            ) : chat.type === 'COURSE_GROUP' ? (
              <GraduationCapIcon className="size-4" />
            ) : (
              <UsersIcon className="size-4" />
            )}
          </AvatarFallback>
        </Avatar>
        {peer && <PresenceDot userId={peer.id} />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium">{title}</span>
          {timestamp && (
            <time dateTime={timestamp} className="ms-auto shrink-0 text-xs text-muted-foreground">
              {formatChatTimestamp(timestamp)}
            </time>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{preview}</span>
          {chat.unreadCount > 0 && (
            <Badge className="shrink-0">{toPersianDigits(chat.unreadCount)}</Badge>
          )}
        </div>
      </div>
    </Link>
  );
}
