'use client';

import { toPersianDigits, type ChatMemberDto, type UserSummaryDto } from '@repo/shared';
import {
  MoreVerticalIcon,
  ShieldIcon,
  ShieldOffIcon,
  UserMinusIcon,
  UserPlusIcon,
  UsersIcon,
  Volume2Icon,
  VolumeOffIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PresenceDot } from '@/components/chat/presence-indicator';
import { UserPicker } from '@/components/chat/user-picker';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Badge } from '@/components/ui/badge';
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
import { useAddMember, useRemoveMember, useUpdateMember } from '@/hooks/use-chats';
import type { ChatPermissions } from '@/hooks/use-permissions';
import { getApiErrorMessage } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/labels';

export function ChatMembersDialog({
  chatId,
  members,
  viewerId,
  creatorId,
  permissions,
}: {
  chatId: string;
  members: ChatMemberDto[];
  viewerId: string;
  creatorId: string;
  permissions: ChatPermissions;
}) {
  const updateMember = useUpdateMember(chatId);
  const addMember = useAddMember(chatId);
  const removeMember = useRemoveMember(chatId);
  const [isPicking, setIsPicking] = useState(false);

  const memberIds = members.map((member) => member.user.id);
  const busy = updateMember.isPending || addMember.isPending || removeMember.isPending;

  function fail(error: unknown) {
    toast.error(getApiErrorMessage(error));
  }

  function change(member: ChatMemberDto, input: { role?: 'ADMIN' | 'MEMBER'; isMuted?: boolean }) {
    updateMember.mutate({ userId: member.user.id, ...input }, { onError: fail });
  }

  function add(user: UserSummaryDto) {
    // The picker lists the whole directory, existing members included, so it
    // marks them as selected rather than hiding them. Clicking one is a no-op.
    if (memberIds.includes(user.id)) return;

    addMember.mutate(
      { userId: user.id, role: 'MEMBER' },
      {
        onError: fail,
        onSuccess: () => toast.success(`${user.name} به گروه اضافه شد.`),
      }
    );
  }

  function remove(member: ChatMemberDto) {
    removeMember.mutate(member.user.id, {
      onError: fail,
      onSuccess: () => toast.success(`${member.user.name} از گروه حذف شد.`),
    });
  }

  return (
    <Dialog onOpenChange={() => setIsPicking(false)}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-2" />}>
        <UsersIcon />
        {toPersianDigits(members.length)} عضو
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>اعضای گفت‌وگو</DialogTitle>
          <DialogDescription>
            هر کی تو این لیسته می‌تونه پیام‌های این چت رو بخونه — حتی اون‌هایی که قبل از اومدنش
            فرستاده شده.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {members.map((member) => {
            const isAdmin = member.role === 'ADMIN';
            const isCreator = member.user.id === creatorId;

            return (
              <li key={member.user.id} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
                <div className="relative shrink-0">
                  <UserAvatar user={member.user} />
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
                    {isAdmin ? 'مدیر گروه' : ROLE_LABELS[member.user.role]} ·{' '}
                    <span dir="ltr">{member.user.universityId}</span>
                  </p>
                </div>

                {/* Says out loud why this row has no menu: the creator's seat is
                    permanent, so there is nothing to offer here. */}
                {isCreator && (
                  <Badge variant="outline" className="shrink-0">
                    سازنده
                  </Badge>
                )}

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
                          disabled={busy}
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
                        {isAdmin ? 'برداشتن مدیر' : 'مدیر کردن'}
                      </DropdownMenuItem>

                      {permissions.canMuteMember(member) && (
                        <DropdownMenuItem
                          onClick={() => change(member, { isMuted: !member.isMuted })}
                        >
                          {member.isMuted ? <Volume2Icon /> : <VolumeOffIcon />}
                          {member.isMuted ? 'رفع بی‌صدا' : 'بی‌صدا کردن'}
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuItem variant="destructive" onClick={() => remove(member)}>
                        <UserMinusIcon />
                        حذف از گروه
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>

        {permissions.canManageMembers &&
          (isPicking ? (
            <div className="flex flex-col gap-3 border-t pt-3">
              <UserPicker
                selected={memberIds}
                onSelect={add}
                multiple
                emptyHint="کسی با این مشخصات پیدا نشد."
              />
              <Button variant="ghost" size="sm" onClick={() => setIsPicking(false)}>
                بستن لیست
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 border-t"
              disabled={busy}
              onClick={() => setIsPicking(true)}
            >
              <UserPlusIcon />
              افزودن عضو
            </Button>
          ))}
      </DialogContent>
    </Dialog>
  );
}
