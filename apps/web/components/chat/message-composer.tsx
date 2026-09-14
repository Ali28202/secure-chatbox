'use client';

import {
  FILE_ACCEPT,
  formatFileSize,
  isAllowedFileType,
  isImageType,
  LIMITS,
  toPersianDigits,
  UPLOAD,
  type MessageDto,
} from '@repo/shared';
import {
  FileTextIcon,
  ImageIcon,
  InfoIcon,
  Loader2Icon,
  PaperclipIcon,
  SendHorizontalIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSendMessage } from '@/hooks/use-messages';
import { useTypingAnnouncer } from '@/hooks/use-typing';
import { getApiErrorMessage } from '@/lib/api';
import { getAttachmentSummary } from '@/lib/chat';

const COUNTER_THRESHOLD = 0.9 * LIMITS.messageContent.max;

function acceptFiles(queued: File[], incoming: File[]): { files: File[]; rejected: string[] } {
  const files = [...queued];
  const rejected: string[] = [];

  for (const file of incoming) {
    if (files.length >= UPLOAD.maxFilesPerMessage) {
      rejected.push(
        `هر پیام حداکثر ${toPersianDigits(UPLOAD.maxFilesPerMessage)} پیوست قبول می‌کنه.`
      );
      break;
    }

    if (!isAllowedFileType(file.type)) {
      rejected.push(`«${file.name}»: این نوع فایل قبول نمی‌شه.`);
      continue;
    }

    if (file.size > UPLOAD.maxFileBytes) {
      rejected.push(`«${file.name}»: حجم فایل بیشتر از ${formatFileSize(UPLOAD.maxFileBytes)}ه.`);
      continue;
    }

    if (
      files.some((queuedFile) => queuedFile.name === file.name && queuedFile.size === file.size)
    ) {
      continue;
    }

    files.push(file);
  }

  return { files, rejected };
}

function AttachmentChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const Icon = isImageType(file.type) ? ImageIcon : FileTextIcon;

  return (
    <li className="flex max-w-56 items-center gap-2 rounded-lg border bg-muted/50 py-1 pe-1 ps-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{file.name}</span>
        <span className="block text-[10px] text-muted-foreground">{formatFileSize(file.size)}</span>
      </span>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`حذف پیوست ${file.name}`}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </li>
  );
}

export function MessageComposer({
  chatId,
  replyTo,
  onCancelReply,
  disabledReason,
}: {
  chatId: string;
  replyTo: MessageDto | null;
  onCancelReply: () => void;
  disabledReason: string | null;
}) {
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const send = useSendMessage(chatId);
  const typing = useTypingAnnouncer(chatId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  if (disabledReason) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
        <InfoIcon className="size-4 shrink-0" />
        {disabledReason}
      </p>
    );
  }

  function pickFiles(selected: FileList | null) {
    if (!selected || selected.length === 0) return;

    const { files: next, rejected } = acceptFiles(files, [...selected]);
    setFiles(next);
    for (const message of rejected) toast.error(message);

    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function submit() {
    const trimmed = content.trim();
    if ((!trimmed && files.length === 0) || send.isPending) return;

    send.mutate(
      {
        ...(trimmed ? { content: trimmed } : {}),
        ...(replyTo ? { replyToId: replyTo.id } : {}),
        files,
      },
      {
        onSuccess: () => {
          setContent('');
          setFiles([]);
          onCancelReply();
          typing.stop();
          // Sending is not leaving: you are mid-conversation and the next
          // message is usually already in your head.
          textareaRef.current?.focus();
        },
        onError: (error) => toast.error(getApiErrorMessage(error)),
      }
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  const remaining = LIMITS.messageContent.max - content.length;
  const isEmpty = content.trim().length === 0 && files.length === 0;
  const isFull = files.length >= UPLOAD.maxFilesPerMessage;

  return (
    <form onSubmit={handleSubmit} className="border-t pt-3">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-lg bg-muted px-3 py-2">
          <div className="min-w-0 flex-1 border-s-2 ps-2 text-xs">
            <p className="font-medium">ریپلای به {replyTo.sender.name}</p>
            <p className="line-clamp-1 text-muted-foreground">
              {replyTo.content ?? getAttachmentSummary(replyTo.attachments.length)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="لغو ریپلای"
            onClick={onCancelReply}
          >
            <XIcon />
          </Button>
        </div>
      )}

      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="پیوست‌های انتخاب‌شده">
          {files.map((file) => (
            <AttachmentChip
              key={`${file.name}:${file.size}:${file.lastModified}`}
              file={file}
              onRemove={() => setFiles((current) => current.filter((queued) => queued !== file))}
            />
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          className="hidden"
          tabIndex={-1}
          onChange={(event) => pickFiles(event.target.files)}
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={isFull ? 'بیشتر از این نمی‌شه پیوست کرد' : 'افزودن پیوست'}
          title={isFull ? 'بیشتر از این نمی‌شه پیوست کرد' : 'افزودن پیوست'}
          disabled={send.isPending || isFull}
          onClick={() => fileInputRef.current?.click()}
        >
          <PaperclipIcon />
        </Button>

        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            // An empty box is not someone typing — clearing the draft should
            // take the indicator down rather than leave it to time out.
            if (event.target.value) typing.announce();
            else typing.stop();
          }}
          onBlur={typing.stop}
          onKeyDown={handleKeyDown}
          maxLength={LIMITS.messageContent.max}
          rows={1}
          placeholder={files.length > 0 ? 'یه توضیح بنویس… (اختیاری)' : 'چی می‌خوای بگی؟'}
          aria-label="متن پیام"
          // Never disabled while a send is in flight. A disabled element loses
          // focus, so Enter would throw you out of the box you are typing in —
          // and there is no reason you cannot start the next message meanwhile.
          className="max-h-40 min-h-10 resize-none"
        />

        <Button
          type="submit"
          size="icon"
          aria-label="ارسال پیام"
          disabled={isEmpty || send.isPending}
        >
          {send.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <SendHorizontalIcon className="rtl:-scale-x-100" />
          )}
        </Button>
      </div>

      {content.length >= COUNTER_THRESHOLD && (
        <p className="mt-1 text-end text-xs text-muted-foreground">
          {toPersianDigits(remaining)} نویسه باقی مانده است
        </p>
      )}
    </form>
  );
}
