'use client';

import { formatDayDivider, isSameDay, type ChatMemberDto, type MessageDto } from '@repo/shared';
import { AlertCircleIcon, Loader2Icon, MessagesSquareIcon } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { MessageBubble } from '@/components/chat/message-bubble';
import { SystemMessage } from '@/components/chat/system-message';
import { Button } from '@/components/ui/button';
import { useDeleteMessage, useMarkRead, useMessages, useSetPinned } from '@/hooks/use-messages';
import type { ChatPermissions } from '@/hooks/use-permissions';
import { getApiErrorMessage } from '@/lib/api';

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

export function MessageList({
  chatId,
  viewerId,
  members,
  permissions,
  onReply,
}: {
  chatId: string;
  viewerId: string;
  members: ChatMemberDto[];
  permissions: ChatPermissions;
  onReply: (message: MessageDto) => void;
}) {
  const query = useMessages(chatId);
  const deleteMessage = useDeleteMessage(chatId);
  const setPinned = useSetPinned(chatId);
  const { mutate: reportRead } = useMarkRead(chatId, viewerId);

  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  const messages = useMemo(
    () => query.data?.pages.flatMap((page) => page.messages) ?? [],
    [query.data]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage();
      },
      { root: containerRef.current, rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  const reportedRef = useRef<{ chatId: string; createdAt: string } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || messages.length === 0) return;

    const createdAtById = new Map(messages.map((message) => [message.id, message.createdAt]));
    const visible = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = () => {
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
      { root: container }
    );

    for (const row of container.querySelectorAll('[data-message-id]')) observer.observe(row);

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
        <p className="font-medium">هنوز پیامی اینجا نیست</p>
        <p className="max-w-sm text-sm text-muted-foreground">اولین پیام رو تو بفرست!</p>
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
        const older = messages[index + 1];
        const startsDay = older ? !isSameDay(message.createdAt, older.createdAt) : !hasNextPage;
        const isOwn = message.sender.id === viewerId;

        // A system note is not a bubble and has no sender side: it interleaves
        // with the transcript but is rendered as a rule across it.
        if (message.systemEvent !== null) {
          return (
            <div key={message.id} className="contents">
              <SystemMessage message={message} />
              {startsDay && <DayDivider date={message.createdAt} />}
            </div>
          );
        }

        return (
          <div key={message.id} className="contents">
            <MessageBubble
              message={message}
              isOwn={isOwn}
              showSender={!older || older.sender.id !== message.sender.id || startsDay}
              canDelete={permissions.canDelete(message.sender.id)}
              canPin={permissions.canPin}
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

      <div ref={sentinelRef} aria-hidden />

      {isFetchingNextPage && (
        <div className="flex justify-center py-2" aria-busy>
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          <span className="sr-only">در حال دریافت پیام‌های قبلی...</span>
        </div>
      )}
    </div>
  );
}
