'use client';

import { toPersianDigits, type MessageDto } from '@repo/shared';
import {
  ArrowRightIcon,
  LockIcon,
  Loader2Icon,
  PinIcon,
  SearchXIcon,
  UnlockIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { ChatMembersDialog } from '@/components/chat/chat-members-dialog';
import { MessageComposer } from '@/components/chat/message-composer';
import { MessageList } from '@/components/chat/message-list';
import { PresenceDot, PresenceLabel } from '@/components/chat/presence-indicator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/use-auth';
import { useChat, useUpdateChat } from '@/hooks/use-chats';
import { usePinnedMessages } from '@/hooks/use-messages';
import { useChatPermissions } from '@/hooks/use-permissions';
import { getApiErrorMessage } from '@/lib/api';
import {
  CHAT_TYPE_LABELS,
  getAttachmentSummary,
  getChatPeer,
  getChatTitle,
  getOtherMembers,
} from '@/lib/chat';
import { getInitials } from '@/lib/labels';
import { ROUTES } from '@/lib/routes';

/**
 * Turns read-only on and off, for an admin.
 *
 * A `Button` rather than a switch because there is no switch primitive in this
 * project, and adding one for a single control would be the tail wagging the
 * dog. It states the current mode and toggles on click — `aria-pressed` is what
 * makes that legible to a screen reader as a two-state control rather than as a
 * command whose effect is a guess.
 */
function ReadOnlyToggle({ chatId, isReadOnly }: { chatId: string; isReadOnly: boolean }) {
  const updateChat = useUpdateChat(chatId);

  return (
    <Button
      variant={isReadOnly ? 'default' : 'outline'}
      size="sm"
      className="gap-1.5"
      aria-pressed={isReadOnly}
      disabled={updateChat.isPending}
      title={
        isReadOnly
          ? 'اکنون تنها مدیران می‌توانند پیام بفرستند. برای باز کردن کلیک کنید.'
          : 'همه می‌توانند پیام بفرستند. برای فقط‌خواندنی کردن کلیک کنید.'
      }
      onClick={() =>
        updateChat.mutate(
          { isReadOnly: !isReadOnly },
          { onError: (error) => toast.error(getApiErrorMessage(error)) }
        )
      }
    >
      {isReadOnly ? <LockIcon /> : <UnlockIcon />}
      {isReadOnly ? 'فقط‌خواندنی' : 'باز'}
    </Button>
  );
}

/**
 * The pinned messages, above the conversation.
 *
 * The newest one is shown in full width and the rest are counted, because a
 * banner that grows with the number of pins is a banner that eventually leaves
 * no room for the chat. Anyone who wants the older ones can scroll to them —
 * they are marked in place.
 */
function PinnedBanner({ messages }: { messages: MessageDto[] }) {
  const [newest, ...rest] = messages;
  if (!newest) return null;

  return (
    <div className="mb-2 flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <PinIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">
          پیام سنجاق‌شده از {newest.sender.name}
        </p>
        <p className="truncate">
          {newest.content ?? getAttachmentSummary(newest.attachments.length)}
        </p>
      </div>

      {rest.length > 0 && (
        <Badge variant="secondary" className="shrink-0">
          +{toPersianDigits(rest.length)}
        </Badge>
      )}
    </div>
  );
}

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

  // Above the early returns, because hooks are. Both tolerate a chat that has
  // not loaded: permissions deny everything until the member list arrives, and
  // the pinned query is keyed on the id, which is known from the route.
  const permissions = useChatPermissions(chat.data);
  const pinned = usePinnedMessages(chatId);

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

  const peer = getChatPeer(chat.data, user.id);
  // Everyone but the viewer: counting yourself as online is true and useless.
  const peerIds = getOtherMembers(chat.data.members, user.id).map((member) => member.user.id);

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

        {/* Shown to everyone, but only an admin's is a button — for everyone
            else it is a badge stating the fact, which is what it was before. */}
        {permissions.canUpdateChat ? (
          <ReadOnlyToggle chatId={chatId} isReadOnly={chat.data.isReadOnly} />
        ) : (
          chat.data.isReadOnly && <Badge variant="outline">فقط‌خواندنی</Badge>
        )}

        {chat.data.type !== 'DIRECT' && (
          <ChatMembersDialog
            chatId={chatId}
            members={chat.data.members}
            viewerId={user.id}
            permissions={permissions}
          />
        )}
      </header>

      {pinned.data && pinned.data.length > 0 && <PinnedBanner messages={pinned.data} />}

      <MessageList
        chatId={chatId}
        viewerId={user.id}
        members={chat.data.members}
        permissions={permissions}
        onReply={setReplyTo}
      />

      <MessageComposer
        chatId={chatId}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        disabledReason={permissions.sendBlockedReason}
      />
    </div>
  );
}
