'use client';

import type { UserSummaryDto } from '@repo/shared';
import { CheckIcon, Loader2Icon, SearchIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useUserDirectory } from '@/hooks/use-users';
import { ROLE_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

interface UserPickerProps {
  selected: string[];
  onSelect: (user: UserSummaryDto) => void;
  multiple?: boolean;
  emptyHint?: string;
}

export function UserPicker({
  selected,
  onSelect,
  multiple = false,
  emptyHint = 'کسی با این مشخصات پیدا نشد.',
}: UserPickerProps) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const directory = useUserDirectory(debouncedSearch);

  const isCatchingUp = directory.isFetching && search !== debouncedSearch;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute inset-y-0 inset-s-3 my-auto size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="جست‌وجو با اسم یا شماره دانشجویی/کارمندی"
          className="ps-9"
          aria-label="جست‌وجوی کاربرها"
        />
        {isCatchingUp && (
          <Loader2Icon className="pointer-events-none absolute inset-y-0 inset-e-3 my-auto size-4 animate-spin text-muted-foreground" />
        )}
      </div>

      <ScrollArea className="h-64 rounded-md border">
        {directory.isPending ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            <span className="sr-only">داره میاد…</span>
          </div>
        ) : directory.isError ? (
          <p className="flex h-64 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            لیست کاربرها نیومد!
          </p>
        ) : directory.data.length === 0 ? (
          <p className="flex h-64 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
            <UsersIcon className="size-6" />
            {emptyHint}
          </p>
        ) : (
          <ul className="p-1">
            {directory.data.map((user) => {
              const isSelected = selected.includes(user.id);

              return (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(user)}
                    aria-pressed={multiple ? isSelected : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-sm px-2 py-2 text-start transition-colors hover:bg-accent',
                      isSelected && 'bg-accent'
                    )}
                  >
                    <UserAvatar user={user} className="shrink-0" />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{user.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {ROLE_LABELS[user.role]} · <span dir="ltr">{user.universityId}</span>
                      </span>
                    </span>

                    {isSelected && <CheckIcon className="size-4 shrink-0 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
