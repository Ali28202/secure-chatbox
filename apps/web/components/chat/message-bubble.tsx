'use client';

import { formatMessageTime, toPersianDigits, type MessageDto } from '@repo/shared';
import { CheckCheckIcon, CheckIcon, MoreVerticalIcon, ReplyIcon, Trash2Icon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getInitials } from '@/lib/labels';
import { cn } from '@/lib/utils';

/** The grey line above a reply, quoting whatever is being answered. */
function ReplyQuote({
  reply,
  isOwn,
}: {
  reply: NonNullable<MessageDto['replyTo']>;
  isOwn: boolean;
}) {
  return (
    <div
      className={cn(
        'mb-1 border-s-2 ps-2 text-xs',
        // Inside a filled bubble the usual muted grey disappears, so the quote
        // is dimmed against its own background instead of the page's.
        isOwn
          ? 'border-primary-foreground/40 text-primary-foreground/80'
          : 'border-border text-muted-foreground'
      )}
    >
      <p className="font-medium">{reply.senderName}</p>
      <p className={cn('line-clamp-2', reply.isDeleted && 'italic')}>
        {reply.isDeleted ? 'این پیام حذف شده است.' : reply.content}
      </p>
    </div>
  );
}

/** How many of the other members have read this message, out of how many. */
export interface ReadState {
  read: number;
  total: number;
}

/**
 * The delivery ticks under your own messages.
 *
 * One tick for sent, two once anyone has read it, and the pair brightens when
 * everyone has — the convention every messenger uses, so it needs no legend.
 *
 * Brightness rather than the familiar blue: these sit on a filled `bg-primary`
 * bubble, and a coloured tick on a coloured background is a tick nobody can
 * see. The count is in the label for the case a group makes ambiguous, where
 * "someone has read this" and "the class has read this" look the same.
 */
function ReadTicks({ read, total }: ReadState) {
  const allRead = total > 0 && read === total;

  const label =
    read === 0
      ? 'ارسال شد'
      : allRead
        ? 'خوانده شد'
        : `خوانده‌شده توسط ${toPersianDigits(read)} نفر از ${toPersianDigits(total)} نفر`;

  const Icon = read === 0 ? CheckIcon : CheckCheckIcon;

  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={cn('shrink-0', allRead ? 'text-primary-foreground' : 'text-primary-foreground/60')}
    >
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}

/**
 * One message.
 *
 * Own messages sit on the far side of the conversation. The row is reversed
 * rather than aligned to a named side, so the mirroring follows the page's
 * direction — on this RTL page "the far side" is the left, and on an LTR one
 * the same markup would put it on the right without a second rule.
 *
 * A deleted message keeps its place in the column. The row is what a reply
 * points at, and removing it would leave every answer quoting nothing; the
 * tombstone is also the honest thing to show, since the message *was* there.
 */
export function MessageBubble({
  message,
  isOwn,
  showSender,
  canDelete,
  readState,
  onReply,
  onDelete,
}: {
  message: MessageDto;
  isOwn: boolean;
  /** False when the message continues a run from the same sender. */
  showSender: boolean;
  canDelete: boolean;
  /** Null where ticks would mean nothing: someone else's message, or a tombstone. */
  readState: ReadState | null;
  onReply: (message: MessageDto) => void;
  onDelete: (message: MessageDto) => void;
}) {
  const canAct = !message.isDeleted;

  return (
    <div
      data-slot="message"
      // The row carries its own id so anything that needs to find a message in
      // the DOM can — M9's read receipts observe these to decide what has
      // actually been on screen.
      data-message-id={message.id}
      className={cn(
        'group flex w-full items-end gap-2',
        isOwn ? 'flex-row-reverse justify-start' : 'justify-start'
      )}
    >
      {/* The avatar column is held open through a run so the bubbles stay in
          line; only the first message of the run actually fills it. Own
          messages have no avatar at all — you know who you are — so the column
          is not reserved on that side. */}
      {!isOwn && (
        <div className="w-8 shrink-0">
          {showSender && (
            <Avatar className="size-8">
              <AvatarFallback className="text-[11px]">
                {getInitials(message.sender.name)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      <div className={cn('flex max-w-[min(38rem,80%)] flex-col', isOwn && 'items-end')}>
        {showSender && !isOwn && (
          <span className="mb-0.5 px-1 text-xs font-medium text-muted-foreground">
            {message.sender.name}
          </span>
        )}

        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm',
            isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted',
            message.isDeleted &&
              'bg-transparent text-muted-foreground ring-1 ring-border ring-inset'
          )}
        >
          {message.replyTo && (
            <ReplyQuote reply={message.replyTo} isOwn={isOwn && !message.isDeleted} />
          )}

          {message.isDeleted ? (
            <p className="flex items-center gap-1.5 italic">
              <Trash2Icon className="size-3.5 shrink-0" />
              این پیام حذف شده است.
            </p>
          ) : (
            // `whitespace-pre-wrap` keeps the line breaks the sender typed;
            // `wrap-break-word` keeps an unbroken URL from widening the bubble
            // past the column.
            <p className="whitespace-pre-wrap wrap-break-word">{message.content}</p>
          )}

          <span className="mt-1 flex items-center justify-end gap-1">
            <time
              dateTime={message.createdAt}
              className={cn(
                'text-[10px] tabular-nums',
                isOwn && !message.isDeleted ? 'text-primary-foreground/70' : 'text-muted-foreground'
              )}
            >
              {formatMessageTime(message.createdAt)}
            </time>

            {readState && <ReadTicks {...readState} />}
          </span>
        </div>
      </div>

      {canAct && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`گزینه‌های پیام ${message.sender.name}`}
                // Hidden until the row is hovered or something inside it takes
                // focus — a menu button on every bubble is noise. On a touch
                // screen there is no hover to reveal it, so below `sm` it stays.
                className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100 data-popup-open:opacity-100"
              />
            }
          >
            <MoreVerticalIcon />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={() => onReply(message)}>
              <ReplyIcon />
              پاسخ
            </DropdownMenuItem>

            {canDelete && (
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(message)}>
                <Trash2Icon />
                حذف پیام
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
