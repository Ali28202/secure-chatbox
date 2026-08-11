'use client';

import { formatDayDivider, isSameDay, type ChatMemberDto, type MessageDto } from '@repo/shared';
import { AlertCircleIcon, Loader2Icon, MessagesSquareIcon } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { MessageBubble } from '@/components/chat/message-bubble';
import { Button } from '@/components/ui/button';
import { useDeleteMessage, useMarkRead, useMessages, useSetPinned } from '@/hooks/use-messages';
import type { ChatPermissions } from '@/hooks/use-permissions';
import { getApiErrorMessage } from '@/lib/api';

/**
 * How long the reader has to stop moving before what is on screen counts as
 * read.
 *
 * Long enough that flicking through a screenful on the way somewhere else does
 * not mark it, short enough that pausing to read registers before they reply.
 */
const SETTLE_MS = 400;

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
  members,
  permissions,
  onReply,
}: {
  chatId: string;
  viewerId: string;
  /** Everyone in the chat — the read watermarks on them draw the tick marks. */
  members: ChatMemberDto[];
  /** Who may delete what, and who may pin — resolved once, from `policy.ts`. */
  permissions: ChatPermissions;
  onReply: (message: MessageDto) => void;
}) {
  const query = useMessages(chatId);
  const deleteMessage = useDeleteMessage(chatId);
  const setPinned = useSetPinned(chatId);
  // Destructured for the same reason `fetchNextPage` is below: the mutation
  // object is a fresh one every render, the function on it is stable, and only
  // the function belongs in an effect's dependencies.
  const { mutate: reportRead } = useMarkRead(chatId, viewerId);

  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  // Flattened before the early returns below, because the read observer is a
  // hook and hooks cannot live behind a `return`. Empty while the first page is
  // loading, which is exactly what the effect wants: nothing to observe yet.
  const messages = useMemo(
    () => query.data?.pages.flatMap((page) => page.messages) ?? [],
    [query.data]
  );

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

  /*
   * The last message actually reported as read, and which chat it belonged to.
   *
   * The chat travels with it because this component is reused across routes:
   * moving from one conversation to the next re-renders it with a new `chatId`
   * rather than remounting it, and a watermark left over from the previous chat
   * would sit above everything here and suppress the first report.
   */
  const reportedRef = useRef<{ chatId: string; createdAt: string } | null>(null);

  /*
   * What the reader has actually had on screen.
   *
   * Batched rather than reported per message: the observer collects which rows
   * are visible, and only once the scrolling has stopped for `SETTLE_MS` does
   * the newest of them go to the server, as one call that advances every
   * receipt behind it. Racing down a long history is a handful of requests, not
   * one per message.
   *
   * It re-runs whenever the list changes, which is deliberate — the observer
   * has to pick up rows that were not in the DOM when it was created, and a
   * message arriving while the reader sits at the bottom is a message that
   * should be marked read without them touching anything.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || messages.length === 0) return;

    const createdAtById = new Map(messages.map((message) => [message.id, message.createdAt]));
    const visible = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = () => {
      // A background tab keeps its layout, so its rows stay "visible" to the
      // observer while nobody is looking at them. Reading is something a person
      // does, not a viewport.
      if (document.visibilityState !== 'visible') return;

      let newest: { id: string; createdAt: string } | null = null;
      for (const id of visible) {
        const createdAt = createdAtById.get(id);
        if (!createdAt) continue;
        if (!newest || createdAt > newest.createdAt) newest = { id, createdAt };
      }
      if (!newest) return;

      const reported = reportedRef.current;
      const last = reported?.chatId === chatId ? reported.createdAt : null;
      // Sitting still at the bottom settles over the same message again and
      // again; only a line that actually moved is worth a request.
      if (last !== null && newest.createdAt <= last) return;

      reportedRef.current = { chatId, createdAt: newest.createdAt };
      reportRead(newest.id);
    };

    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.messageId;
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        restart();
      },
      // No threshold: a message taller than the box could never reach a
      // fractional one, and would stay unread no matter how long it was read.
      { root: container }
    );

    for (const row of container.querySelectorAll('[data-message-id]')) observer.observe(row);

    // Coming back to the tab moves nothing, so the observer stays silent — but
    // everything on screen has just become genuinely seen.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') restart();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [chatId, messages, reportRead]);

  /*
   * Everyone else's read watermarks, for the ticks under your own messages.
   *
   * A plain array of timestamps: the only question asked of it is "how many of
   * these have reached this message", and a message is read by someone iff
   * their line is at or past it. Nulls are dropped rather than kept as a
   * sentinel — a member who has read nothing can never satisfy that test.
   */
  const otherWatermarks = useMemo(
    () =>
      members
        .filter((member) => member.user.id !== viewerId)
        .map((member) => member.lastReadAt)
        .filter((lastReadAt): lastReadAt is string => lastReadAt !== null),
    [members, viewerId]
  );
  const otherCount = members.length - 1;

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

  function handleSetPinned(message: MessageDto, isPinned: boolean) {
    setPinned.mutate(
      { messageId: message.id, isPinned },
      { onError: (error) => toast.error(getApiErrorMessage(error)) }
    );
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
        const isOwn = message.sender.id === viewerId;

        return (
          // Rendered after the bubble, which in a reversed column puts it
          // above — the divider introduces the day it belongs to.
          <div key={message.id} className="contents">
            <MessageBubble
              message={message}
              isOwn={isOwn}
              showSender={!older || older.sender.id !== message.sender.id || startsDay}
              canDelete={permissions.canDelete(message.sender.id)}
              canPin={permissions.canPin}
              // Only your own messages carry ticks. Whether the person across
              // from you has read *their* own message is not a question, and a
              // tombstone has nothing left to read.
              readState={
                isOwn && !message.isDeleted
                  ? {
                      read: otherWatermarks.filter((at) => at >= message.createdAt).length,
                      total: otherCount,
                    }
                  : null
              }
              onReply={onReply}
              onDelete={handleDelete}
              onSetPinned={handleSetPinned}
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
