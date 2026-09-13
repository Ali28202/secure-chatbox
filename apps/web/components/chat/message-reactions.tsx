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

function useReact(chatId: string, messageId: string) {
  const toggle = useToggleReaction(chatId);

  return {
    pending: toggle.isPending,
    react: (emoji: string) =>
      toggle.mutate(
        { messageId, emoji },
        { onError: (error) => toast.error(getApiErrorMessage(error)) }
      ),
  };
}

/**
 * The tally, rendered inside the bubble.
 *
 * It belongs in the bubble rather than under it: a row of its own added a gap
 * below every message that carried one, which pushed the whole conversation
 * apart. Inside, the bubble simply grows to fit.
 */
export function MessageReactionList({
  chatId,
  messageId,
  reactions,
  isOwn,
}: {
  chatId: string;
  messageId: string;
  reactions: MessageReactionDto[];
  isOwn: boolean;
}) {
  const viewer = useCurrentUser();
  const { react, pending } = useReact(chatId, messageId);

  if (reactions.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {reactions.map(({ emoji, userIds }) => {
        // `userIds`, not a count and not a flag — the payload is broadcast to
        // the whole room, so both are the reader's to work out.
        const mine = userIds.includes(viewer.id);

        return (
          <button
            key={emoji}
            type="button"
            onClick={() => react(emoji)}
            disabled={pending}
            aria-pressed={mine}
            aria-label={`${emoji} — ${toPersianDigits(userIds.length)} نفر`}
            className={cn(
              'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs transition-colors disabled:opacity-50',
              // Inside a bubble that is already coloured, so the states are
              // drawn against the sender's background rather than the page's.
              isOwn
                ? mine
                  ? 'bg-primary-foreground/30 ring-1 ring-primary-foreground/50'
                  : 'bg-primary-foreground/15 hover:bg-primary-foreground/25'
                : mine
                  ? 'bg-background ring-1 ring-primary'
                  : 'bg-background/60 hover:bg-background'
            )}
          >
            <span aria-hidden>{emoji}</span>
            <span className="tabular-nums">{toPersianDigits(userIds.length)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The picker, which sits beside the message's own menu rather than in the bubble. */
export function AddReactionButton({
  chatId,
  messageId,
  senderName,
}: {
  chatId: string;
  messageId: string;
  senderName: string;
}) {
  const { react, pending } = useReact(chatId, messageId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            aria-label={`واکنش به پیام ${senderName}`}
            className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100 data-popup-open:opacity-100"
          />
        }
      >
        <SmilePlusIcon />
      </DropdownMenuTrigger>

      {/* Menu *items*, not bare buttons: an item dismisses the popup on select.
          A plain button leaves it open, and its backdrop then eats the next
          click — including the one on the pill that just appeared. */}
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
  );
}
