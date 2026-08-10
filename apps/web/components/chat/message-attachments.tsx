'use client';

import { formatFileSize, isImageType, type AttachmentDto } from '@repo/shared';
import { DownloadIcon, FileTextIcon } from 'lucide-react';
import { attachmentUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * An image, shown in place.
 *
 * A plain `<img>`, not `next/image`: the optimizer runs on the web server,
 * which holds no session, so an authenticated URL routed through it comes back
 * 401 — see `attachmentUrl`. `loading="lazy"` covers most of what the component
 * would have bought here, since a chat renders a screen at a time.
 */
function AttachmentImage({ attachment }: { attachment: AttachmentDto }) {
  const href = attachmentUrl(attachment.id);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      // The full-size image opens in a tab rather than a lightbox. A lightbox is
      // a modal, a focus trap and a keyboard contract; a tab is the browser's
      // own zoom, back button and save dialog, already working.
      className="block overflow-hidden rounded-lg ring-1 ring-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      title={attachment.fileName}
    >
      <img
        src={href}
        alt={attachment.fileName}
        loading="lazy"
        // `bg-muted` so the space is a placeholder rather than a hole while the
        // bytes are in flight.
        className="max-h-72 w-full bg-muted object-cover"
      />
    </a>
  );
}

/** Anything that is not an image: a row you click to download. */
function AttachmentFile({ attachment, isOwn }: { attachment: AttachmentDto; isOwn: boolean }) {
  return (
    <a
      href={attachmentUrl(attachment.id)}
      // The API answers these with `Content-Disposition: attachment`, so the
      // browser saves rather than navigates. `download` is here for the case
      // where it decides otherwise, and it is deliberately bare — a filename
      // given here would override the server's, and the server's is the
      // sanitized one.
      download
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

/**
 * Everything hanging off one message.
 *
 * Images and files are separated rather than laid out in the order they were
 * attached, because they want different shapes: images tile into a grid and are
 * read at a glance, files stack into rows and are read one at a time. Mixing
 * them would give both the worse of the two layouts.
 */
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
        <div
          className={cn(
            'grid gap-1',
            // One image gets the full bubble width; more than one pairs up, so
            // a set of four reads as a block rather than a column the length of
            // the screen.
            images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          )}
        >
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
