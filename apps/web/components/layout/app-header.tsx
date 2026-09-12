'use client';

import { toPersianDigits } from '@repo/shared';

import { LogOutIcon, ShieldIcon } from 'lucide-react';
import Link from 'next/link';
import { SessionsDialog } from '@/components/auth/sessions-dialog';
import { MessageSearchDialog } from '@/components/chat/message-search-dialog';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { usePendingCount } from '@/hooks/use-admin';
import { useCurrentUser, useLogout } from '@/hooks/use-auth';
import { getInitials, ROLE_LABELS } from '@/lib/labels';
import { ROUTES } from '@/lib/routes';

/** Only rendered for admins, so the count is only ever fetched by one. */
function AdminLink() {
  const pending = usePendingCount();

  return (
    <Button variant="ghost" size="sm" className="gap-2" render={<Link href={ROUTES.admin} />}>
      <ShieldIcon />
      <span className="hidden sm:inline">مدیریت</span>
      {pending.data !== undefined && pending.data > 0 && (
        <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
          {toPersianDigits(pending.data)}
        </Badge>
      )}
    </Button>
  );
}

export function AppHeader() {
  const user = useCurrentUser();
  const logout = useLogout();

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
        <ShieldIcon className="size-5 shrink-0 text-muted-foreground" />
        <span className="font-semibold">چت‌باکس</span>

        <div className="ms-auto flex items-center gap-1">
          {user.role === 'ADMIN' && <AdminLink />}
          <MessageSearchDialog />
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" className="h-9 gap-2 px-2" aria-label="حساب کاربری" />
              }
            >
              <Avatar className="size-7">
                <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-normal sm:inline">{user.name}</span>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROLE_LABELS[user.role]} · <span dir="ltr">{user.universityId}</span>
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <SessionsDialog />
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={logout.isPending}
                  onClick={() => logout.mutate()}
                >
                  <LogOutIcon />
                  خروج از حساب
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
