'use client';

import { formatDayDivider, isSameDay, type MessageDto } from '@repo/shared';
import { AlertCircleIcon, Loader2Icon, MessagesSquareIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { MessageBubble } from '@/components/chat/message-bubble';
import { Button } from '@/components/ui/button';
import { useDeleteMessage, useMessages } from '@/hooks/use-messages';
import { getApiErrorMessage } from '@/lib/api';

function DayDivider({ date }: { date: string }) {
  return (
    <div className="my-3 flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-border" />
      <time dateTime={date} className="text-xs text-muted-foreground">
        {formatDayDivider(date)}
      </time>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * The conversation itself.
 *
 * Two things about the layout are load-bearing rather than stylistic:
 *
 * `flex-col-reverse` on the scroll container means the DOM runs newest-first
 * and the browser anchors the scroll to the bottom. A new message arriving is
 * inserted at the *start* of the flow, so the view stays put if the reader has
 * scrolled up and follows along if they have not — behaviour that otherwise
 * takes a `scrollTop` calculation on every render, and gets it wrong whenever
 * an image finishes loading.
 *
 * It also means the cache's order is the render order: the API answers
 * newest-first and so does this list, so no page ever has to be reversed.
 * The older pages appended by `fetchNextPage` land at the visual top, where
 * nothing below them moves.
 */
export function MessageList({
  chatId,
  viewerId,
  isChatAdmin,
  onReply,
}: {
  chatId: string;
  viewerId: string;
  /** Chat admins may delete anyone's message; everyone else only their own. */
  isChatAdmin: boolean;
  onReply: (message: MessageDto) => void;
}) {
  const query = useMessages(chatId);
  const deleteMessage = useDeleteMessage(chatId);

  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage) return;

    // Scoped to the scroll container, not the page: this list scrolls inside
    // its own box, so the viewport never learns that the sentinel came into
    // view. The margin starts the fetch a screenful early, which is what makes
    // scrolling up feel continuous instead of stepped.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
      },
      { root: containerRef.current, rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  if (query.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center" aria-busy>
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">در حال بارگذاری پیام‌ها…</span>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <AlertCircleIcon className="size-8 text-muted-foreground" />
        <p className="font-medium">پیام‌ها بارگذاری نشد</p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          تلاش دوباره
        </Button>
      </div>
    );
  }

  const messages = query.data.pages.flatMap((page) => page.messages);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <MessagesSquareIcon className="size-8 text-muted-foreground" />
        <p className="font-medium">هنوز پیامی در این گفت‌وگو نیست</p>
        <p className="max-w-sm text-sm text-muted-foreground">نخستین پیام را شما بفرستید.</p>
      </div>
    );
  }

  function handleDelete(message: MessageDto) {
    deleteMessage.mutate(message.id, {
      onError: (error) => toast.error(getApiErrorMessage(error)),
    });
  }

  return (
    <div
      ref={containerRef}
      data-slot="message-list"
      className="flex min-h-0 flex-1 flex-col-reverse gap-1 overflow-y-auto px-1 py-2"
    >
      {messages.map((message, index) => {
        // The next entry is the *older* one, since the array runs newest-first.
        const older = messages[index + 1];
        const startsDay = older ? !isSameDay(message.createdAt, older.createdAt) : !hasNextPage;

        return (
          // Rendered after the bubble, which in a reversed column puts it
          // above — the divider introduces the day it belongs to.
          <div key={message.id} className="contents">
            <MessageBubble
              message={message}
              isOwn={message.sender.id === viewerId}
              showSender={!older || older.sender.id !== message.sender.id || startsDay}
              canDelete={isChatAdmin || message.sender.id === viewerId}
              onReply={onReply}
              onDelete={handleDelete}
            />
            {startsDay && <DayDivider date={message.createdAt} />}
          </div>
        );
      })}

      {/* Last in the DOM, so it sits at the very top of the conversation. */}
      <div ref={sentinelRef} aria-hidden />

      {isFetchingNextPage && (
        <div className="flex justify-center py-2" aria-busy>
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          <span className="sr-only">در حال بارگذاری پیام‌های پیشین…</span>
        </div>
      )}
    </div>
  );
}
