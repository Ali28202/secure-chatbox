'use client';

import type { MessageDto } from '@repo/shared';
import { ArrowRightIcon, Loader2Icon, SearchXIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ChatMembersDialog } from '@/components/chat/chat-members-dialog';
import { MessageComposer } from '@/components/chat/message-composer';
import { MessageList } from '@/components/chat/message-list';
import { PresenceDot, PresenceLabel } from '@/components/chat/presence-indicator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/use-auth';
import { useChat } from '@/hooks/use-chats';
import { CHAT_TYPE_LABELS, getChatPeer, getChatTitle, getOtherMembers } from '@/lib/chat';
import { getInitials } from '@/lib/labels';
import { ROUTES } from '@/lib/routes';

/**
 * One conversation: who is in it, what was said in it, and the box to add to
 * it.
 *
 * The API answers 404 when a chat exists but is not yours, so there is one
 * "not found" state here rather than two — a deliberate choice, not an
 * omission. Telling the two apart would tell an outsider that the chat exists.
 */
export function ChatDetail({ chatId }: { chatId: string }) {
  const user = useCurrentUser();
  const chat = useChat(chatId);
  const [replyTo, setReplyTo] = useState<MessageDto | null>(null);

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
          یا حذف شده است، یا شما عضو آن نیستید.
        </p>
        <Button variant="outline" size="sm" render={<Link href={ROUTES.chats} />}>
          بازگشت به فهرست گفت‌وگوها
        </Button>
      </div>
    );
  }

  const title = getChatTitle(chat.data, user.id);
  const membership = chat.data.members.find((member) => member.user.id === user.id);
  const isChatAdmin = membership?.role === 'ADMIN';

  const peer = getChatPeer(chat.data, user.id);
  // Everyone but the viewer: counting yourself as online is true and useless.
  const peerIds = getOtherMembers(chat.data.members, user.id).map((member) => member.user.id);

  /*
   * The same two rules `assertCanSend` enforces on the API, in the same order.
   * Duplicating them is a deliberate trade: the server decides, but a person
   * who cannot send should be told why before they type a message and lose it
   * to a refusal. M11 moves both into `policy.ts`, where the API and this
   * screen can read one copy.
   */
  const disabledReason = membership?.isMuted
    ? 'شما در این گفت‌وگو بی‌صدا شده‌اید و نمی‌توانید پیام بفرستید.'
    : chat.data.isReadOnly && !isChatAdmin
      ? 'این گفت‌وگو فقط‌خواندنی است.'
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 pb-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="بازگشت"
          render={<Link href={ROUTES.chats} />}
        >
          {/* The arrow points right because "back" runs with the text in RTL. */}
          <ArrowRightIcon />
        </Button>

        <div className="relative shrink-0">
          <Avatar className="size-10">
            <AvatarFallback className="text-sm">{getInitials(title)}</AvatarFallback>
          </Avatar>
          {peer && <PresenceDot userId={peer.id} />}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{title}</h1>
          {/* Presence when there is any, the chat's type when there is not —
              one line, because the type never changes and is the less useful of
              the two to anyone already looking at the conversation. */}
          <p className="truncate text-xs text-muted-foreground">
            <PresenceLabel userIds={peerIds} fallback={CHAT_TYPE_LABELS[chat.data.type]} />
          </p>
        </div>

        {chat.data.isReadOnly && <Badge variant="outline">فقط‌خواندنی</Badge>}

        {chat.data.type !== 'DIRECT' && (
          <ChatMembersDialog members={chat.data.members} viewerId={user.id} />
        )}
      </header>

      <MessageList
        chatId={chatId}
        viewerId={user.id}
        members={chat.data.members}
        isChatAdmin={isChatAdmin}
        onReply={setReplyTo}
      />

      <MessageComposer
        chatId={chatId}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        disabledReason={disabledReason}
      />
    </div>
  );
}
