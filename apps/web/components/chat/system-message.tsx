'use client';

import type { MessageDto } from '@repo/shared';
import { UserMinusIcon, UserPlusIcon } from 'lucide-react';

function describe(message: MessageDto): string {
  const actor = message.sender.name;
  // The target can be null if that account was since removed: the relation is
  // `SetNull`, because losing the note entirely would be worse than a vague one.
  const target = message.systemTarget?.name ?? 'یک کاربر';

  return message.systemEvent === 'MEMBER_ADDED'
    ? `${actor} ${target} را به گروه اضافه کرد`
    : `${actor} ${target} را از گروه حذف کرد`;
}

/** A rule across the conversation, not a bubble — it belongs to nobody. */
export function SystemMessage({ message }: { message: MessageDto }) {
  const Icon = message.systemEvent === 'MEMBER_ADDED' ? UserPlusIcon : UserMinusIcon;

  return (
    <div data-slot="system-message" className="flex items-center gap-3 py-1" role="status">
      <span className="h-px flex-1 bg-border" aria-hidden />
      <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {describe(message)}
      </span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}
