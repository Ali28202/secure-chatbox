'use client';

import { toPersianDigits, type ChatMemberDto } from '@repo/shared';
import { UsersIcon, VolumeOffIcon } from 'lucide-react';
import { PresenceDot } from '@/components/chat/presence-indicator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { getInitials, ROLE_LABELS } from '@/lib/labels';

/**
 * The member list, behind a button rather than down the page.
 *
 * It used to sit above the conversation, which was fine when there was no
 * conversation to push down. A course group is a class-sized list, and thirty
 * names between the title and the first message is thirty names nobody reads
 * twice.
 */
export function ChatMembersDialog({
  members,
  viewerId,
}: {
  members: ChatMemberDto[];
  viewerId: string;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-2" />}>
        <UsersIcon />
        {toPersianDigits(members.length)} عضو
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>اعضای گفت‌وگو</DialogTitle>
          <DialogDescription>
            هر کسی که در این فهرست است می‌تواند پیام‌های این گفت‌وگو را بخواند.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {members.map((member) => (
            <li key={member.user.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
              <div className="relative shrink-0">
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">
                    {getInitials(member.user.name)}
                  </AvatarFallback>
                </Avatar>
                {member.user.id !== viewerId && <PresenceDot userId={member.user.id} />}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.user.name}
                  {member.user.id === viewerId && (
                    <span className="text-muted-foreground"> (شما)</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {member.role === 'ADMIN' ? 'مدیر گفت‌وگو' : ROLE_LABELS[member.user.role]} ·{' '}
                  <span dir="ltr">{member.user.universityId}</span>
                </p>
              </div>

              {member.isMuted && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <VolumeOffIcon className="size-3.5" />
                  بی‌صدا
                </span>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
