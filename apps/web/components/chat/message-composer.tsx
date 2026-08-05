'use client';

import { LIMITS, toPersianDigits, type MessageDto } from '@repo/shared';
import { InfoIcon, Loader2Icon, SendHorizontalIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSendMessage } from '@/hooks/use-messages';
import { getApiErrorMessage } from '@/lib/api';

/** How much of the budget must be gone before the counter is worth the space. */
const COUNTER_THRESHOLD = 0.9 * LIMITS.messageContent.max;

/**
 * The box you type in.
 *
 * `disabledReason` is Persian text rather than a boolean: a composer that is
 * simply greyed out reads as a bug, and the two reasons it can happen — the
 * chat is read-only, or you have been muted in it — are things the person
 * needs told. The API enforces both regardless; this only saves a round trip
 * to be refused.
 */
export function MessageComposer({
  chatId,
  replyTo,
  onCancelReply,
  disabledReason,
}: {
  chatId: string;
  replyTo: MessageDto | null;
  onCancelReply: () => void;
  disabledReason: string | null;
}) {
  const [content, setContent] = useState('');
  const send = useSendMessage(chatId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Picking a message to answer should leave the cursor where the answer goes;
  // otherwise every reply starts with a click the person did not ask to make.
  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  if (disabledReason) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
        <InfoIcon className="size-4 shrink-0" />
        {disabledReason}
      </p>
    );
  }

  function submit() {
    const trimmed = content.trim();
    if (!trimmed || send.isPending) return;

    send.mutate(
      { content: trimmed, ...(replyTo ? { replyToId: replyTo.id } : {}) },
      {
        onSuccess: () => {
          setContent('');
          onCancelReply();
        },
        onError: (error) => toast.error(getApiErrorMessage(error)),
      }
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line — the convention every messenger
    // shares. `isComposing` guards the case where Enter is confirming a word in
    // an input method rather than finishing a message.
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  const remaining = LIMITS.messageContent.max - content.length;

  return (
    <form onSubmit={handleSubmit} className="border-t pt-3">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-lg bg-muted px-3 py-2">
          <div className="min-w-0 flex-1 border-s-2 ps-2 text-xs">
            <p className="font-medium">پاسخ به {replyTo.sender.name}</p>
            <p className="line-clamp-1 text-muted-foreground">{replyTo.content}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="لغو پاسخ"
            onClick={onCancelReply}
          >
            <XIcon />
          </Button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={LIMITS.messageContent.max}
          rows={1}
          placeholder="پیام خود را بنویسید…"
          aria-label="متن پیام"
          disabled={send.isPending}
          className="max-h-40 min-h-10 resize-none"
        />

        <Button
          type="submit"
          size="icon"
          aria-label="ارسال پیام"
          disabled={content.trim().length === 0 || send.isPending}
        >
          {send.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            // The arrow has to point the way the text runs, and the icon is
            // drawn for a left-to-right page.
            <SendHorizontalIcon className="rtl:-scale-x-100" />
          )}
        </Button>
      </div>

      {content.length >= COUNTER_THRESHOLD && (
        <p className="mt-1 text-end text-xs text-muted-foreground">
          {toPersianDigits(remaining)} نویسه باقی مانده است
        </p>
      )}
    </form>
  );
}
