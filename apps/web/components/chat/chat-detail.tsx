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
          ? 'فعلاً فقط مدیرها می‌تونن پیام بدن. برای باز کردن گروه کلیک کن.'
          : 'الان همه می‌تونن پیام بدن. برای قفل کردن گروه کلیک کن.'
      }
      onClick={() =>
        updateChat.mutate(
          { isReadOnly: !isReadOnly },
          { onError: (error) => toast.error(getApiErrorMessage(error)) }
        )
      }
    >
      {isReadOnly ? <LockIcon /> : <UnlockIcon />}
      {isReadOnly ? 'بسته' : 'باز'}
    </Button>
  );
}

function PinnedBanner({ messages }: { messages: MessageDto[] }) {
  const [newest, ...rest] = messages;
  if (!newest) return null;

  return (
    <div className="mb-2 flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <PinIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">
          پیام پین‌شده از {newest.sender.name}
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

export function ChatDetail({ chatId }: { chatId: string }) {
  const user = useCurrentUser();
  const chat = useChat(chatId);
  const [replyTo, setReplyTo] = useState<MessageDto | null>(null);

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
          این گروه یا کلاً پاک شده، یا تو عضوش نیستی.
        </p>
        <Button variant="outline" size="sm" render={<Link href={ROUTES.chats} />}>
          بازگشت به فهرست گفت‌وگوها
        </Button>
      </div>
    );
  }

  const title = getChatTitle(chat.data, user.id);

  const peer = getChatPeer(chat.data, user.id);
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
          <p className="truncate text-xs text-muted-foreground">
            <PresenceLabel userIds={peerIds} fallback={CHAT_TYPE_LABELS[chat.data.type]} />
          </p>
        </div>

        {permissions.canUpdateChat ? (
          <ReadOnlyToggle chatId={chatId} isReadOnly={chat.data.isReadOnly} />
        ) : (
          chat.data.isReadOnly && <Badge variant="outline">بسته</Badge>
        )}

        {chat.data.type !== 'DIRECT' && (
          <ChatMembersDialog
            chatId={chatId}
            members={chat.data.members}
            viewerId={user.id}
            creatorId={chat.data.creatorId}
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
