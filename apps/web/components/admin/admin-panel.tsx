'use client';

import { ACCOUNT_STATUSES, GLOBAL_ROLES, toPersianDigits, type AdminUserDto } from '@repo/shared';
import {
  BanIcon,
  CheckIcon,
  Loader2Icon,
  SearchIcon,
  ShieldIcon,
  UndoIcon,
  XIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useAdminUsers, useUpdateUser } from '@/hooks/use-admin';
import { useCurrentUser } from '@/hooks/use-auth';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { getApiErrorMessage } from '@/lib/api';
import { ACCOUNT_STATUS_LABELS, getInitials, ROLE_LABELS } from '@/lib/labels';
import { ROUTES } from '@/lib/routes';

type Filter = (typeof ACCOUNT_STATUSES)[number] | 'ALL';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'PENDING', label: 'در انتظار تأیید' },
  { value: 'APPROVED', label: 'تأییدشده' },
  { value: 'REJECTED', label: 'ردشده' },
  { value: 'ALL', label: 'همه' },
];

function StatusBadge({ user }: { user: AdminUserDto }) {
  if (!user.isActive) return <Badge variant="destructive">غیرفعال</Badge>;

  return (
    <Badge
      variant={
        user.status === 'APPROVED'
          ? 'secondary'
          : user.status === 'REJECTED'
            ? 'destructive'
            : 'default'
      }
    >
      {ACCOUNT_STATUS_LABELS[user.status]}
    </Badge>
  );
}

export function AdminPanel() {
  const viewer = useCurrentUser();
  const router = useRouter();

  // The API refuses anyone who is not an ADMIN regardless. This only avoids
  // rendering a panel whose every request would come back 403.
  useEffect(() => {
    if (viewer.role !== 'ADMIN') router.replace(ROUTES.chats);
  }, [viewer.role, router]);

  const [filter, setFilter] = useState<Filter>('PENDING');
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);

  const users = useAdminUsers({
    ...(filter === 'ALL' ? {} : { status: filter }),
    ...(debounced.trim() ? { search: debounced.trim() } : {}),
  });
  const update = useUpdateUser();

  function apply(
    user: AdminUserDto,
    input: { role?: AdminUserDto['role']; status?: AdminUserDto['status']; isActive?: boolean },
    done: string
  ) {
    update.mutate(
      { userId: user.id, ...input },
      {
        onError: (error) => toast.error(getApiErrorMessage(error)),
        onSuccess: () => toast.success(done),
      }
    );
  }

  if (viewer.role !== 'ADMIN') return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="flex items-center gap-3">
        <ShieldIcon className="size-5 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold">مدیریت کاربران</h1>
          <p className="text-xs text-muted-foreground">
            تأیید ثبت‌نام، تغییر نقش و غیرفعال‌کردن حساب‌ها
          </p>
        </div>
        {users.data && <Badge variant="outline">{toPersianDigits(users.data.total)} کاربر</Badge>}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="tablist" aria-label="فیلتر وضعیت">
          {FILTERS.map(({ value, label }) => (
            <Button
              key={value}
              size="sm"
              role="tab"
              aria-selected={filter === value}
              variant={filter === value ? 'secondary' : 'ghost'}
              onClick={() => setFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="relative ms-auto min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute inset-y-0 inset-s-3 my-auto size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جست‌وجو با نام یا شماره دانشجویی"
            aria-label="جست‌وجوی کاربران"
            className="ps-9"
          />
        </div>
      </div>

      {users.isPending ? (
        <div className="flex flex-1 items-center justify-center" aria-busy>
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
          <span className="sr-only">در حال بارگذاری…</span>
        </div>
      ) : users.isError ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          فهرست کاربران بارگذاری نشد.
        </p>
      ) : users.data.users.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          کاربری با این مشخصات پیدا نشد.
        </p>
      ) : (
        <ul className="flex flex-col divide-y overflow-y-auto rounded-lg border">
          {users.data.users.map((user) => {
            const isSelf = user.id === viewer.id;

            return (
              <li key={user.id} className="flex items-center gap-3 p-3">
                <Avatar className="size-9 shrink-0">
                  <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {user.name}
                    {isSelf && <span className="text-muted-foreground"> (شما)</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ROLE_LABELS[user.role]} · <span dir="ltr">{user.universityId}</span> ·{' '}
                    {toPersianDigits(user.chatCount)} گفت‌وگو
                  </p>
                </div>

                <StatusBadge user={user} />

                {user.status === 'PENDING' && !isSelf && (
                  <>
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={update.isPending}
                      onClick={() => apply(user, { status: 'APPROVED' }, `${user.name} تأیید شد.`)}
                    >
                      <CheckIcon />
                      تأیید
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={update.isPending}
                      onClick={() => apply(user, { status: 'REJECTED' }, `${user.name} رد شد.`)}
                    >
                      <XIcon />
                      رد
                    </Button>
                  </>
                )}

                {/* No menu on your own row: the API refuses it anyway, and
                    offering an action that always fails is worse than none. */}
                {!isSelf && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={update.isPending}
                          aria-label={`مدیریت حساب ${user.name}`}
                        />
                      }
                    >
                      <ShieldIcon />
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="start" className="w-52">
                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                        تغییر نقش
                      </DropdownMenuLabel>
                      {GLOBAL_ROLES.filter((role) => role !== user.role).map((role) => (
                        <DropdownMenuItem
                          key={role}
                          onClick={() =>
                            apply(user, { role }, `نقش ${user.name} شد ${ROLE_LABELS[role]}.`)
                          }
                        >
                          {ROLE_LABELS[role]}
                        </DropdownMenuItem>
                      ))}

                      <DropdownMenuSeparator />

                      {user.status === 'REJECTED' && (
                        <DropdownMenuItem
                          onClick={() =>
                            apply(user, { status: 'APPROVED' }, `${user.name} تأیید شد.`)
                          }
                        >
                          <UndoIcon />
                          تأیید کردن
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuItem
                        variant={user.isActive ? 'destructive' : 'default'}
                        onClick={() =>
                          apply(
                            user,
                            { isActive: !user.isActive },
                            user.isActive
                              ? `حساب ${user.name} غیرفعال شد.`
                              : `حساب ${user.name} فعال شد.`
                          )
                        }
                      >
                        <BanIcon />
                        {user.isActive ? 'غیرفعال کردن حساب' : 'فعال کردن حساب'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
