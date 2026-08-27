'use client';

import { formatFileSize, isImageType, type AttachmentDto } from '@repo/shared';
import { DownloadIcon, FileTextIcon } from 'lucide-react';
import { attachmentUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

function AttachmentImage({ attachment }: { attachment: AttachmentDto }) {
  const href = attachmentUrl(attachment.id);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-lg ring-1 ring-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      title={attachment.fileName}
    >
      <img
        src={href}
        alt={attachment.fileName}
        loading="lazy"
        className="max-h-72 w-full bg-muted object-cover"
      />
    </a>
  );
}

function AttachmentFile({ attachment, isOwn }: { attachment: AttachmentDto; isOwn: boolean }) {
  return (
    <a
      href={attachmentUrl(attachment.id)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
        isOwn
          ? 'bg-primary-foreground/15 hover:bg-primary-foreground/25'
          : 'bg-background/70 hover:bg-background'
      )}
    >
      <FileTextIcon className="size-5 shrink-0" aria-hidden />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{attachment.fileName}</span>
        <span className={cn('block text-[10px]', isOwn ? 'opacity-70' : 'text-muted-foreground')}>
          {formatFileSize(attachment.fileSize)}
        </span>
      </span>

      <DownloadIcon className="size-4 shrink-0 opacity-60" aria-hidden />
    </a>
  );
}

export function MessageAttachments({
  attachments,
  isOwn,
}: {
  attachments: AttachmentDto[];
  isOwn: boolean;
}) {
  if (attachments.length === 0) return null;

  const images = attachments.filter((attachment) => isImageType(attachment.fileType));
  const files = attachments.filter((attachment) => !isImageType(attachment.fileType));

  return (
    <div className="mb-1 flex flex-col gap-1.5">
      {images.length > 0 && (
        <div className={cn('grid gap-1', images.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
          {images.map((attachment) => (
            <AttachmentImage key={attachment.id} attachment={attachment} />
          ))}
        </div>
      )}

      {files.map((attachment) => (
        <AttachmentFile key={attachment.id} attachment={attachment} isOwn={isOwn} />
      ))}
    </div>
  );
}
