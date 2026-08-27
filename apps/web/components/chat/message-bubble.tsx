'use client';

import { formatMessageTime, toPersianDigits, type MessageDto } from '@repo/shared';
import {
  CheckCheckIcon,
  CheckIcon,
  MoreVerticalIcon,
  PinIcon,
  PinOffIcon,
  ReplyIcon,
  Trash2Icon,
} from 'lucide-react';
import { MessageAttachments } from '@/components/chat/message-attachments';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getAttachmentSummary } from '@/lib/chat';
import { getInitials } from '@/lib/labels';
import { cn } from '@/lib/utils';

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
        isOwn
          ? 'border-primary-foreground/40 text-primary-foreground/80'
          : 'border-border text-muted-foreground'
      )}
    >
      <p className="font-medium">{reply.senderName}</p>
      <p className={cn('line-clamp-2', (reply.isDeleted || !reply.content) && 'italic')}>
        {reply.isDeleted
          ? 'این پیام حذف شده است.'
          : (reply.content ?? getAttachmentSummary(reply.attachmentCount))}
      </p>
    </div>
  );
}
export interface ReadState {
  read: number;
  total: number;
}

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

export function MessageBubble({
  message,
  isOwn,
  showSender,
  canDelete,
  canPin,
  readState,
  onReply,
  onDelete,
  onSetPinned,
}: {
  message: MessageDto;
  isOwn: boolean;
  showSender: boolean;
  canDelete: boolean;
  canPin: boolean;
  readState: ReadState | null;
  onReply: (message: MessageDto) => void;
  onDelete: (message: MessageDto) => void;
  onSetPinned: (message: MessageDto, isPinned: boolean) => void;
}) {
  const canAct = !message.isDeleted;

  return (
    <div
      data-slot="message"
      data-message-id={message.id}
      className={cn(
        'group flex w-full items-end gap-2',
        isOwn ? 'flex-row-reverse justify-start' : 'justify-start'
      )}
    >
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
            <>
              <MessageAttachments attachments={message.attachments} isOwn={isOwn} />

              {message.content && (
                <p className="whitespace-pre-wrap wrap-break-word">{message.content}</p>
              )}
            </>
          )}

          <span className="mt-1 flex items-center justify-end gap-1">
            {message.isPinned && !message.isDeleted && (
              <PinIcon
                aria-label="پین‌شده"
                role="img"
                className={cn(
                  'size-3 shrink-0',
                  isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'
                )}
              />
            )}

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
                className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100 data-popup-open:opacity-100"
              />
            }
          >
            <MoreVerticalIcon />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuItem onClick={() => onReply(message)}>
              <ReplyIcon />
              ریپلای
            </DropdownMenuItem>

            {canPin && (
              <DropdownMenuItem onClick={() => onSetPinned(message, !message.isPinned)}>
                {message.isPinned ? <PinOffIcon /> : <PinIcon />}
                {message.isPinned ? 'برداشتن پین' : 'پین‌ کردن'}
              </DropdownMenuItem>
            )}

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
