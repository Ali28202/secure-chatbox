'use client';

import { AlertCircleIcon, ArchiveIcon, InboxIcon, MessagesSquareIcon } from 'lucide-react';
import { useState } from 'react';
import { ChatListItem } from '@/components/chat/chat-list-item';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/use-auth';
import { useChats } from '@/hooks/use-chats';

function ChatListSkeleton() {
  return (
    <ul className="flex flex-col gap-1" aria-busy aria-label="در حال بارگذاری گفت‌وگوها">
      {[0, 1, 2, 3].map((row) => (
        <li key={row} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ChatList({ activeChatId }: { activeChatId?: string }) {
  const user = useCurrentUser();
  const [archived, setArchived] = useState(false);
  const chats = useChats(archived);

  // Rendered above every branch below, so the way back out of the archive is
  // there even when the archive is empty or failed to load.
  const tabs = (
    <div className="mb-2 flex gap-1" role="tablist" aria-label="نمای گفت‌وگوها">
      <Button
        variant={archived ? 'ghost' : 'secondary'}
        size="sm"
        role="tab"
        aria-selected={!archived}
        className="flex-1 gap-1.5"
        onClick={() => setArchived(false)}
      >
        <InboxIcon />
        گفت‌وگوها
      </Button>
      <Button
        variant={archived ? 'secondary' : 'ghost'}
        size="sm"
        role="tab"
        aria-selected={archived}
        className="flex-1 gap-1.5"
        onClick={() => setArchived(true)}
      >
        <ArchiveIcon />
        آرشیو
      </Button>
    </div>
  );

  if (chats.isPending) {
    return (
      <>
        {tabs}
        <ChatListSkeleton />
      </>
    );
  }

  if (chats.isError) {
    return (
      <>
        {tabs}
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <AlertCircleIcon className="size-8 text-muted-foreground" />
          <p className="font-medium">گفت‌وگوهات لود نشدن!</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            انگار به شبکه دانشگاه وصل نیستی! اتصالت رو چک کن و دوباره امتحان کن.
          </p>
          <Button variant="outline" size="sm" onClick={() => void chats.refetch()}>
            تلاش دوباره
          </Button>
        </div>
      </>
    );
  }

  if (chats.data.length === 0) {
    return (
      <>
        {tabs}
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          {archived ? (
            <>
              <ArchiveIcon className="size-8 text-muted-foreground" />
              <p className="font-medium">آرشیو خالیه</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                گروهی که آرشیو کنی اینجا می‌مونه؛ هیچ پیامی پاک نمی‌شه و هر وقت بخوای برمی‌گردونیش.
              </p>
            </>
          ) : (
            <>
              <MessagesSquareIcon className="size-8 text-muted-foreground" />
              <p className="font-medium">هنوز گفت‌وگویی نداری</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                برای شروع یه چت خصوصی یا ساختن گروه، کافیه روی دکمهٔ «گفت‌وگوی جدید» بزنی.
              </p>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {tabs}
      <ul className="flex flex-col gap-1">
        {chats.data.map((chat) => (
          <li key={chat.id}>
            <ChatListItem chat={chat} viewerId={user.id} isActive={chat.id === activeChatId} />
          </li>
        ))}
      </ul>
    </>
  );
}
