'use client';

import type { ChatMemberDto } from '@repo/shared';
import { useCurrentUser } from '@/hooks/use-auth';
import { useTypingUserIds } from '@/stores/typing-store';

/** Names, not ids — and never more than two, or the line outgrows the row. */
function describe(names: string[]): string {
  const [first, second] = names;

  if (names.length === 1) return `${first} در حال نوشتن است…`;
  if (names.length === 2) return `${first} و ${second} در حال نوشتن هستند…`;

  return 'چند نفر در حال نوشتن هستند…';
}

export function TypingIndicator({ chatId, members }: { chatId: string; members: ChatMemberDto[] }) {
  const viewer = useCurrentUser();
  const typingIds = useTypingUserIds(chatId, viewer.id);

  // Someone who typed and then left the group would otherwise be an id with no
  // name. Resolving through the roster drops them instead of rendering blank.
  const names = typingIds
    .map((id) => members.find((member) => member.user.id === id)?.user.name)
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) return null;

  return (
    <p
      className="flex items-center gap-1.5 px-1 pb-1 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span className="flex gap-0.5" aria-hidden>
        <Dot className="[animation-delay:0ms]" />
        <Dot className="[animation-delay:150ms]" />
        <Dot className="[animation-delay:300ms]" />
      </span>
      {describe(names)}
    </p>
  );
}

function Dot({ className }: { className?: string }) {
  return (
    <span
      className={`size-1.5 animate-bounce rounded-full bg-muted-foreground/60 ${className ?? ''}`}
    />
  );
}
