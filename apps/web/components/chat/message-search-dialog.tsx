'use client';

import { LIMITS, toPersianDigits } from '@repo/shared';
import { Loader2Icon, SearchIcon, SearchXIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useMessageSearch } from '@/hooks/use-search';
import { CHAT_TYPE_LABELS } from '@/lib/chat';
import { ROUTES } from '@/lib/routes';

function highlight(text: string, term: string) {
  if (!term) return text;

  const parts: (string | { match: string })[] = [];
  const haystack = text.toLocaleLowerCase('fa');
  const needle = term.toLocaleLowerCase('fa');

  let at = 0;
  for (;;) {
    const found = haystack.indexOf(needle, at);
    if (found === -1) break;

    if (found > at) parts.push(text.slice(at, found));
    parts.push({ match: text.slice(found, found + needle.length) });
    at = found + needle.length;
  }
  parts.push(text.slice(at));

  return parts.map((part, index) =>
    typeof part === 'string' ? (
      part
    ) : (
      <mark key={index} className="rounded-sm bg-primary/20 text-inherit">
        {part.match}
      </mark>
    )
  );
}

export function MessageSearchDialog() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term);
  const results = useMessageSearch(debounced);

  const tooShort = debounced.trim().length > 0 && debounced.trim().length < LIMITS.search.min;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTerm('');
      }}
    >
      <DialogTrigger
        render={<Button variant="outline" size="icon" aria-label="جست‌وجوی پیام‌ها" />}
      >
        <SearchIcon />
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>جست‌وجوی پیام‌ها</DialogTitle>
          <DialogDescription>
            فقط تو گفت‌وگوهایی می‌گرده که عضوشی. پیام‌های حذف‌شده پیدا نمی‌شن.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute inset-y-0 inset-s-3 my-auto size-4 text-muted-foreground" />
          <Input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            maxLength={LIMITS.search.max}
            placeholder="دنبال چی می‌گردی؟"
            aria-label="عبارت جست‌وجو"
            className="ps-9"
          />
          {results.isFetching && (
            <Loader2Icon className="pointer-events-none absolute inset-y-0 inset-e-3 my-auto size-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <ScrollArea className="h-80 rounded-md border">
          {tooShort ? (
            <p className="flex h-80 items-center justify-center px-4 text-center text-sm text-muted-foreground">
              حداقل {toPersianDigits(LIMITS.search.min)} کاراکتر بنویس.
            </p>
          ) : !results.data ? (
            <p className="flex h-80 items-center justify-center px-4 text-center text-sm text-muted-foreground">
              چیزی بنویس تا بگردم.
            </p>
          ) : results.data.length === 0 ? (
            <p className="flex h-80 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
              <SearchXIcon className="size-6" />
              پیامی با این عبارت پیدا نشد.
            </p>
          ) : (
            <ul className="p-1">
              {results.data.map(({ message, chatId, chatTitle, chatType }) => (
                <li key={message.id}>
                  <Link
                    href={ROUTES.chat(chatId)}
                    onClick={() => setOpen(false)}
                    className="block rounded-sm px-2 py-2 transition-colors hover:bg-accent"
                  >
                    <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate font-medium">
                        {chatTitle ?? CHAT_TYPE_LABELS[chatType]}
                      </span>
                      <span className="shrink-0">{message.sender.name}</span>
                    </p>
                    <p className="line-clamp-2 text-sm">
                      {highlight(message.content ?? '', debounced.trim())}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
