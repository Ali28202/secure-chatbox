'use client';

import { REACTION_EMOJIS, toPersianDigits, type MessageReactionDto } from '@repo/shared';
import { SmilePlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser } from '@/hooks/use-auth';
import { useToggleReaction } from '@/hooks/use-messages';
import { getApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

export function MessageReactions({
  chatId,
  messageId,
  reactions,
  senderName,
}: {
  chatId: string;
  messageId: string;
  reactions: MessageReactionDto[];
  senderName: string;
}) {
  const viewer = useCurrentUser();
  const toggle = useToggleReaction(chatId);

  function react(emoji: string) {
    toggle.mutate(
      { messageId, emoji },
      { onError: (error) => toast.error(getApiErrorMessage(error)) }
    );
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map(({ emoji, userIds }) => {
        // `userIds`, not a count and not a flag — the payload is broadcast to
        // the whole room, so both are the reader's to work out.
        const mine = userIds.includes(viewer.id);

        return (
          <button
            key={emoji}
            type="button"
            onClick={() => react(emoji)}
            disabled={toggle.isPending}
            aria-pressed={mine}
            aria-label={`${emoji} — ${toPersianDigits(userIds.length)} نفر`}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
              'hover:bg-accent disabled:opacity-50',
              mine ? 'border-primary bg-primary/10' : 'border-transparent bg-muted'
            )}
          >
            <span aria-hidden>{emoji}</span>
            <span className="tabular-nums">{toPersianDigits(userIds.length)}</span>
          </button>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={toggle.isPending}
              aria-label={`واکنش به پیام ${senderName}`}
              className="size-6 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100 data-popup-open:opacity-100"
            />
          }
        >
          <SmilePlusIcon className="size-3.5" />
        </DropdownMenuTrigger>

        {/* Menu *items*, not bare buttons: an item dismisses the popup on
            select. A plain button leaves it open, and its backdrop then eats the
            next click — including the one on the pill that just appeared. */}
        <DropdownMenuContent align="start" className="flex w-auto gap-0.5 p-1">
          {REACTION_EMOJIS.map((emoji) => (
            <DropdownMenuItem
              key={emoji}
              onClick={() => react(emoji)}
              aria-label={emoji}
              className="justify-center rounded-md p-1 text-base"
            >
              {emoji}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
