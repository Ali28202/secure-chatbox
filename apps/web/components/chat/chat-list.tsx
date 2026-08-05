'use client';

import { AlertCircleIcon, MessagesSquareIcon } from 'lucide-react';
import { ChatListItem } from '@/components/chat/chat-list-item';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/hooks/use-auth';
import { useChats } from '@/hooks/use-chats';

/** Matches the row height of a real item so the list does not jump on load. */
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
  const chats = useChats();

  if (chats.isPending) return <ChatListSkeleton />;

  if (chats.isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <AlertCircleIcon className="size-8 text-muted-foreground" />
        <p className="font-medium">فهرست گفت‌وگوها بارگذاری نشد</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          اتصال خود به شبکهٔ دانشگاه را بررسی کنید و دوباره تلاش کنید.
        </p>
        <Button variant="outline" size="sm" onClick={() => void chats.refetch()}>
          تلاش دوباره
        </Button>
      </div>
    );
  }

  if (chats.data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <MessagesSquareIcon className="size-8 text-muted-foreground" />
        <p className="font-medium">هنوز گفت‌وگویی ندارید</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          با دکمهٔ «گفت‌وگوی جدید» یک گفت‌وگوی خصوصی آغاز کنید یا گروهی بسازید. گروه‌هایی که استادان
          شما را به آن‌ها اضافه کنند نیز همین‌جا نمایان می‌شوند.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {chats.data.map((chat) => (
        <li key={chat.id}>
          <ChatListItem chat={chat} viewerId={user.id} isActive={chat.id === activeChatId} />
        </li>
      ))}
    </ul>
  );
}
