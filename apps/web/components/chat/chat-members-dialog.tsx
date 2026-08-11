'use client';

import { toPersianDigits, type ChatMemberDto } from '@repo/shared';
import {
  MoreVerticalIcon,
  ShieldIcon,
  ShieldOffIcon,
  UsersIcon,
  Volume2Icon,
  VolumeOffIcon,
} from 'lucide-react';
import { toast } from 'sonner';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUpdateMember } from '@/hooks/use-chats';
import type { ChatPermissions } from '@/hooks/use-permissions';
import { getApiErrorMessage } from '@/lib/api';
import { getInitials, ROLE_LABELS } from '@/lib/labels';

/**
 * The member list, behind a button rather than down the page.
 *
 * It used to sit above the conversation, which was fine when there was no
 * conversation to push down. A course group is a class-sized list, and thirty
 * names between the title and the first message is thirty names nobody reads
 * twice.
 *
 * For an admin it is also where the chat is administered: promote, demote,
 * mute, unmute. Each item is offered only where `policy.ts` says the API would
 * accept it, so the menu never holds an action that answers 403 — and the
 * viewer's own row never has one at all, because acting on yourself is the
 * thing the policy refuses outright. That refusal is what keeps a group from
 * being left without an admin: nobody can demote themselves, so the only way
 * out is to promote someone else first.
 */
export function ChatMembersDialog({
  chatId,
  members,
  viewerId,
  permissions,
}: {
  chatId: string;
  members: ChatMemberDto[];
  viewerId: string;
  permissions: ChatPermissions;
}) {
  const updateMember = useUpdateMember(chatId);

  function change(member: ChatMemberDto, input: { role?: 'ADMIN' | 'MEMBER'; isMuted?: boolean }) {
    updateMember.mutate(
      { userId: member.user.id, ...input },
      { onError: (error) => toast.error(getApiErrorMessage(error)) }
    );
  }

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
          {members.map((member) => {
            const isAdmin = member.role === 'ADMIN';

            return (
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
                    {isAdmin ? 'مدیر گفت‌وگو' : ROLE_LABELS[member.user.role]} ·{' '}
                    <span dir="ltr">{member.user.universityId}</span>
                  </p>
                </div>

                {member.isMuted && (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <VolumeOffIcon className="size-3.5" />
                    بی‌صدا
                  </span>
                )}

                {permissions.canUpdateMember(member) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={updateMember.isPending}
                          aria-label={`مدیریت عضویت ${member.user.name}`}
                        />
                      }
                    >
                      <MoreVerticalIcon />
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuItem
                        onClick={() => change(member, { role: isAdmin ? 'MEMBER' : 'ADMIN' })}
                      >
                        {isAdmin ? <ShieldOffIcon /> : <ShieldIcon />}
                        {isAdmin ? 'برداشتن مدیریت' : 'مدیر کردن'}
                      </DropdownMenuItem>

                      {/* Absent for an admin rather than disabled: muting the
                          moderator is not an action with a reason to explain,
                          and the API refuses it for the same reason. */}
                      {permissions.canMuteMember(member) && (
                        <DropdownMenuItem
                          onClick={() => change(member, { isMuted: !member.isMuted })}
                        >
                          {member.isMuted ? <Volume2Icon /> : <VolumeOffIcon />}
                          {member.isMuted ? 'رفع بی‌صدا' : 'بی‌صدا کردن'}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
