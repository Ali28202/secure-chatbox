'use client';

import { formatChatTimestamp, toPersianDigits } from '@repo/shared';
import { ArrowRightIcon, Loader2Icon, MessagesSquareIcon, SearchXIcon } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useCurrentUser } from '@/hooks/use-auth';
import { useChat } from '@/hooks/use-chats';
import { CHAT_TYPE_LABELS, getChatTitle, getOtherMembers } from '@/lib/chat';
import { getInitials, ROLE_LABELS } from '@/lib/labels';
import { ROUTES } from '@/lib/routes';

/**
 * One conversation: who is in it and, from M7, what was said in it.
 *
 * The API answers 404 for a chat that exists but is not yours, so there is one
 * "not found" state here rather than two — which is the point of that choice,
 * not an omission.
 */
export function ChatDetail({ chatId }: { chatId: string }) {
  const user = useCurrentUser();
  const chat = useChat(chatId);

  if (chat.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center" aria-busy>
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">در حال بارگذاری…</span>
      </div>
    );
  }

  if (chat.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <SearchXIcon className="size-8 text-muted-foreground" />
        <p className="font-medium">این گفت‌وگو در دسترس نیست</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          ممکن است حذف شده باشد یا دیگر عضو آن نباشید.
        </p>
        <Button variant="outline" size="sm" render={<Link href={ROUTES.chats} />}>
          بازگشت به فهرست گفت‌وگوها
        </Button>
      </div>
    );
  }

  const title = getChatTitle(chat.data, user.id);
  const others = getOtherMembers(chat.data.members, user.id);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="بازگشت"
          render={<Link href={ROUTES.chats} />}
        >
          {/* The arrow points right because "back" runs with the text in RTL. */}
          <ArrowRightIcon />
        </Button>

        <Avatar className="size-10 shrink-0">
          <AvatarFallback className="text-sm">{getInitials(title)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {CHAT_TYPE_LABELS[chat.data.type]}
            {chat.data.type !== 'DIRECT' && ` · ${toPersianDigits(chat.data.members.length)} عضو`}
            {chat.data.lastMessageAt &&
              ` · آخرین پیام ${formatChatTimestamp(chat.data.lastMessageAt)}`}
          </p>
        </div>

        {chat.data.isReadOnly && (
          <Badge variant="outline" className="ms-auto">
            فقط‌خواندنی
          </Badge>
        )}
      </div>

      <Separator className="my-4" />

      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="text-sm font-medium">
          اعضا
        </h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {others.map((member) => (
            <li
              key={member.user.id}
              className="flex items-center gap-2 rounded-full border py-1 pe-3 ps-1"
            >
              <Avatar className="size-6">
                <AvatarFallback className="text-[10px]">
                  {getInitials(member.user.name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm">{member.user.name}</span>
              <span className="text-xs text-muted-foreground">
                {member.role === 'ADMIN' ? 'مدیر گفت‌وگو' : ROLE_LABELS[member.user.role]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/*
       * The message history and composer arrive in M7. This placeholder is
       * deliberate: the chat is reachable and its membership is real, so the
       * screen should say what is missing rather than look broken.
       */}
      <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <MessagesSquareIcon className="size-8 text-muted-foreground" />
        <p className="font-medium">هنوز پیامی در این گفت‌وگو نیست</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          ارسال و نمایش پیام‌ها در گام بعدی پیاده‌سازی می‌شود.
        </p>
      </div>
    </div>
  );
}
