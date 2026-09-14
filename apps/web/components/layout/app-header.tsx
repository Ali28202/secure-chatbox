'use client';

import { toPersianDigits } from '@repo/shared';
import { LogOutIcon, MoonIcon, SettingsIcon, ShieldIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { MessageSearchDialog } from '@/components/chat/message-search-dialog';
import { Badge } from '@/components/ui/badge';
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
import { UserAvatar } from '@/components/ui/user-avatar';
import { usePendingCount } from '@/hooks/use-admin';
import { useCurrentUser, useLogout } from '@/hooks/use-auth';
import { ROLE_LABELS } from '@/lib/labels';
import { ROUTES } from '@/lib/routes';

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

function ThemeMenuItem() {
  const { resolvedTheme, setTheme } = useTheme();

  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <DropdownMenuItem closeOnClick={false} onClick={() => setTheme(isDark ? 'light' : 'dark')}>
      {isDark ? <SunIcon /> : <MoonIcon />}
      {isDark ? 'نمایش روشن' : 'نمایش تیره'}
    </DropdownMenuItem>
  );
}

function AdminMenuItem() {
  const pending = usePendingCount();

  return (
    <DropdownMenuItem render={<Link href={ROUTES.admin} />}>
      <ShieldIcon />
      <span className="flex-1">مدیریت کاربرها</span>
      {pending.data !== undefined && pending.data > 0 && (
        <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
          {toPersianDigits(pending.data)}
        </Badge>
      )}
    </DropdownMenuItem>
  );
}

export function AppHeader() {
  const user = useCurrentUser();
  const logout = useLogout();

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
        <Link
          href={ROUTES.chats}
          className="flex items-center gap-3 rounded-md outline-ring/50 focus-visible:outline-2"
        >
          <ShieldIcon className="size-5 shrink-0 text-muted-foreground" />
          <span className="font-semibold">چت‌باکس</span>
        </Link>

        <div className="ms-auto flex items-center gap-1">
          <MessageSearchDialog />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" className="h-9 gap-2 px-2" aria-label="حساب کاربری" />
              }
            >
              <UserAvatar user={user} className="size-7" />
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

                <DropdownMenuItem render={<Link href={ROUTES.settings} />}>
                  <SettingsIcon />
                  تنظیمات
                </DropdownMenuItem>

                <ThemeMenuItem />

                {user.role === 'ADMIN' && <AdminMenuItem />}

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
