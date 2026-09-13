'use client';

import { AVATAR, toPersianDigits } from '@repo/shared';
import { Loader2Icon, Trash2Icon, UploadIcon, UserRoundIcon } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { SessionsDialog } from '@/components/auth/sessions-dialog';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useCurrentUser } from '@/hooks/use-auth';
import { useClearAvatar, useSetAvatar } from '@/hooks/use-profile';
import { getApiErrorMessage } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/labels';

const MEGABYTE = 1024 * 1024;

export function SettingsPanel() {
  const user = useCurrentUser();
  const setAvatar = useSetAvatar();
  const clearAvatar = useClearAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = setAvatar.isPending || clearAvatar.isPending;

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    // Checked again on the server, magic bytes and all. This is only so the
    // obvious mistakes fail instantly instead of after an upload.
    if (file.size > AVATAR.maxBytes) {
      toast.error(
        `حجم تصویر باید کمتر از ${toPersianDigits(AVATAR.maxBytes / MEGABYTE)} مگابایت باشد.`
      );
    } else if (!(AVATAR.types as readonly string[]).includes(file.type)) {
      toast.error('تصویر باید PNG، JPEG یا WebP باشد.');
    } else {
      setAvatar.mutate(file, {
        onError: (error) => toast.error(getApiErrorMessage(error)),
        onSuccess: () => toast.success('تصویر پروفایل به‌روز شد.'),
      });
    }

    // Always: picking the same file twice in a row fires no change event
    // otherwise, so a failed upload could not be retried.
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    // Its own scrollbox, because the shell around it is pinned to the viewport
    // and nothing else will scroll on its behalf.
    //
    // The scrolling element is a plain block and the column lives inside it. As
    // a flex column it would make every section a flex item, and flex items
    // shrink by default — the page would squash to fit instead of scrolling.
    <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-lg font-semibold">تنظیمات</h1>
          <p className="text-xs text-muted-foreground">تصویر پروفایل و دستگاه‌های واردشده</p>
        </header>

        <section className="flex flex-col gap-4 rounded-lg border p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <UserRoundIcon className="size-4 text-muted-foreground" />
            تصویر پروفایل
          </h2>

          <div className="flex items-center gap-4">
            <UserAvatar user={user} className="size-20" />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {ROLE_LABELS[user.role]} · <span dir="ltr">{user.universityId}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PNG، JPEG یا WebP — حداکثر {toPersianDigits(AVATAR.maxBytes / MEGABYTE)} مگابایت
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={AVATAR.types.join(',')}
              className="sr-only"
              aria-label="انتخاب تصویر پروفایل"
              onChange={(event) => pick(event.target.files)}
            />

            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {setAvatar.isPending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
              {user.hasAvatar ? 'تغییر تصویر' : 'انتخاب تصویر'}
            </Button>

            {user.hasAvatar && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                disabled={busy}
                onClick={() =>
                  clearAvatar.mutate(undefined, {
                    onError: (error) => toast.error(getApiErrorMessage(error)),
                    onSuccess: () => toast.success('تصویر پروفایل حذف شد.'),
                  })
                }
              >
                <Trash2Icon />
                حذف تصویر
              </Button>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2 rounded-lg border p-4">
          <h2 className="text-sm font-medium">امنیت</h2>
          <p className="text-xs text-muted-foreground">
            هر ورود یک نشست است. پایان‌دادن به یک نشست همان لحظه اثر می‌کند.
          </p>
          <SessionsDialog />
        </section>
      </div>
    </div>
  );
}
