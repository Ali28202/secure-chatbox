'use client';

import { LogOutIcon, ShieldIcon } from 'lucide-react';
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
import { useCurrentUser, useLogout } from '@/hooks/use-auth';
import { getInitials, ROLE_LABELS } from '@/lib/labels';

export function AppHeader() {
  const user = useCurrentUser();
  const logout = useLogout();

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
        <ShieldIcon className="size-5 shrink-0 text-muted-foreground" />
        <span className="font-semibold">چت‌باکس</span>

        <div className="ms-auto flex items-center gap-1">
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
