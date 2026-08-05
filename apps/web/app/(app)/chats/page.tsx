'use client';

import { MessagesSquareIcon } from 'lucide-react';
import { useCurrentUser } from '@/hooks/use-auth';
import { ROLE_LABELS } from '@/lib/labels';

export default function ChatsPage() {
  const user = useCurrentUser();

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-2xl font-bold tracking-tight">گفت‌وگوها</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {user.name} — {ROLE_LABELS[user.role]}
      </p>

      <div className="mt-8 flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <MessagesSquareIcon className="size-8 text-muted-foreground" />
        <p className="font-medium">هنوز گفت‌وگویی ندارید</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          پس از آغاز یک گفت‌وگوی خصوصی یا افزوده‌شدن به گروه درسی، فهرست گفت‌وگوهای شما اینجا نمایش
          داده می‌شود.
        </p>
      </div>
    </div>
  );
}
