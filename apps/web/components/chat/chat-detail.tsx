'use client';

import { toPersianDigits, type MessageDto } from '@repo/shared';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowRightIcon,
  Loader2Icon,
  LockIcon,
  MoreVerticalIcon,
  PinIcon,
  SearchXIcon,
  Trash2Icon,
  UnlockIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ChatMembersDialog } from '@/components/chat/chat-members-dialog';
import { MessageComposer } from '@/components/chat/message-composer';
import { TypingIndicator } from '@/components/chat/typing-indicator';
import { MessageList } from '@/components/chat/message-list';
import { PresenceDot, PresenceLabel } from '@/components/chat/presence-indicator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useCurrentUser } from '@/hooks/use-auth';
import { useChat, useDeleteChat, useUpdateChat } from '@/hooks/use-chats';
import { usePinnedMessages } from '@/hooks/use-messages';
import { useChatPermissions, type ChatPermissions } from '@/hooks/use-permissions';
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

function DeleteChatDialog({
  chatId,
  title,
  open,
  onOpenChange,
}: {
  chatId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const deleteChat = useDeleteChat(chatId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>حذف «{title}»؟</DialogTitle>
          <DialogDescription>
            گفت‌وگو برای همهٔ اعضا ناپدید می‌شود و دیگر نمی‌توانند پیام‌هایش را ببینند. هیچ پیامی از
            پایگاه داده پاک نمی‌شود، ولی از داخل برنامه راهی برای برگرداندنش نیست.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="destructive"
            disabled={deleteChat.isPending}
            onClick={() =>
              deleteChat.mutate(undefined, {
                onError: (error) => toast.error(getApiErrorMessage(error)),
                onSuccess: () => {
                  toast.success(`«${title}» حذف شد.`);
                  router.replace(ROUTES.chats);
                },
              })
            }
          >
            {deleteChat.isPending && <Loader2Icon className="animate-spin" />}
            بله، حذف کن
          </Button>

          <DialogClose render={<Button variant="outline" />}>انصراف</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Everything that changes the conversation itself, in one menu.
 *
 * These were three buttons in the header competing with the member count for
 * space. They are also the rare actions — you open a chat to read it, not to
 * retire it — so they belong behind a control rather than in front of one.
 */
function ChatActionsMenu({
  chatId,
  title,
  isArchived,
  isReadOnly,
  permissions,
}: {
  chatId: string;
  title: string;
  isArchived: boolean;
  isReadOnly: boolean;
  permissions: ChatPermissions;
}) {
  const updateChat = useUpdateChat(chatId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function update(input: { isReadOnly?: boolean; isArchived?: boolean }) {
    updateChat.mutate(input, { onError: (error) => toast.error(getApiErrorMessage(error)) });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="تنظیمات گفت‌وگو"
              disabled={updateChat.isPending}
            />
          }
        >
          <MoreVerticalIcon />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-56">
          {/* An archived conversation is closed to everyone already, so offering
              a read-only switch on top of it would be two words for one state. */}
          {permissions.canUpdateChat && !isArchived && (
            <DropdownMenuItem onClick={() => update({ isReadOnly: !isReadOnly })}>
              {isReadOnly ? <UnlockIcon /> : <LockIcon />}
              {isReadOnly ? 'باز کردن گروه' : 'بستن گروه'}
            </DropdownMenuItem>
          )}

          {permissions.canArchiveChat && (
            <DropdownMenuItem onClick={() => update({ isArchived: !isArchived })}>
              {isArchived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
              {isArchived ? 'خروج از آرشیو' : 'آرشیو کردن'}
            </DropdownMenuItem>
          )}

          {permissions.canDeleteChat && (
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmingDelete(true)}>
              <Trash2Icon />
              حذف گروه
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteChatDialog
        chatId={chatId}
        title={title}
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
      />
    </>
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
          {/* A direct chat is a person and shows their picture; a group is not,
              so it keeps the initials of its title. */}
          {peer ? (
            <UserAvatar user={peer} className="size-10" />
          ) : (
            <Avatar className="size-10">
              <AvatarFallback className="text-sm">{getInitials(title)}</AvatarFallback>
            </Avatar>
          )}
          {peer && <PresenceDot userId={peer.id} />}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            <PresenceLabel userIds={peerIds} fallback={CHAT_TYPE_LABELS[chat.data.type]} />
          </p>
        </div>

        {/* State is still shown to everyone; only the switches moved into the
            menu, and only for the people who may throw them. */}
        {chat.data.archivedAt !== null && <Badge variant="secondary">آرشیو</Badge>}
        {chat.data.isReadOnly && chat.data.archivedAt === null && (
          <Badge variant="outline">بسته</Badge>
        )}

        {chat.data.type !== 'DIRECT' &&
          (permissions.canUpdateChat ||
            permissions.canArchiveChat ||
            permissions.canDeleteChat) && (
            <ChatActionsMenu
              chatId={chatId}
              title={title}
              isArchived={chat.data.archivedAt !== null}
              isReadOnly={chat.data.isReadOnly}
              permissions={permissions}
            />
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

      <TypingIndicator chatId={chatId} members={chat.data.members} />

      <MessageComposer
        chatId={chatId}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        disabledReason={permissions.sendBlockedReason}
      />
    </div>
  );
}
