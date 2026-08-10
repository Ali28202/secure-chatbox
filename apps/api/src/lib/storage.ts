import { mkdir, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { ALLOWED_FILE_TYPES, isAllowedFileType, UPLOAD, type AllowedFileType } from '@repo/shared';
import { env } from '../env';
import { Errors } from './errors';

/**
 * Attachments on disk.
 *
 * Every rule about what may be stored lives here, on the near side of the only
 * function that writes anything. The service above decides *whether* a message
 * may be sent; this decides what is allowed to become a file, and it assumes
 * the request is hostile — a filename, a content type and a size are all just
 * strings a client chose to send.
 *
 * Three rules do most of the work:
 *
 *   1. The stored name is generated here. Nothing the client sent appears in
 *      any path, so there is no traversal to sanitize and no extension to be
 *      tricked about.
 *   2. The extension comes from the allowlist, keyed by the declared type —
 *      never from the uploaded filename.
 *   3. Where a type has a reliable signature, the bytes must agree with the
 *      declaration before anything is written.
 */

/** The upload root, absolute, so nothing below has to care about the cwd. */
const ROOT = isAbsolute(env.UPLOAD_DIR) ? env.UPLOAD_DIR : resolve(process.cwd(), env.UPLOAD_DIR);

export interface StoredFile {
  /** Path relative to the upload root — exactly what goes in `Attachment.fileUrl`. */
  fileUrl: string;
  fileName: string;
  fileType: AllowedFileType;
  fileSize: number;
}

/**
 * Leading bytes each type must actually start with.
 *
 * A declared `Content-Type` is worth nothing on its own: a multipart part
 * carries whatever the client typed there. This does not make the upload safe
 * on its own either — the serving route's `Content-Disposition` and `nosniff`
 * are what stop a file being interpreted — but it is what stops the *stored*
 * record from lying about its own contents, and it is three lines.
 *
 * `null` marks a type with no signature worth checking. `text/plain` is any
 * bytes at all by definition, so the allowlist and the download headers carry
 * it alone.
 */
const SIGNATURES: Record<AllowedFileType, (number[] | null)[]> = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  // "GIF87a" and "GIF89a".
  'image/gif': [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  ],
  // "RIFF"; the "WEBP" that follows sits at offset 8, past the size field, so
  // the container is what is checked here.
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  // "%PDF-"
  'application/pdf': [[0x25, 0x50, 0x44, 0x46, 0x2d]],
  'text/plain': [null],
  // Every OOXML document is a zip: "PK\x03\x04".
  'application/zip': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    [0x50, 0x4b, 0x03, 0x04],
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
    [0x50, 0x4b, 0x03, 0x04],
  ],
  // The pre-2007 Office formats share one OLE compound-file header.
  'application/msword': [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
  'application/vnd.ms-excel': [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
  'application/vnd.ms-powerpoint': [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
};

/**
 * The uploaded name, reduced to something safe to store and echo back.
 *
 * Never used to build a path — see the header — so this is about display and
 * about the `Content-Disposition` header the download route writes. Directory
 * separators and control characters go because a name is rendered in a browser
 * and written into an HTTP header, and both have opinions about those.
 */
function safeDisplayName(name: string, extension: string): string {
  const cleaned = [...name]
    // Tested by code point rather than by a character class: the characters
    // being excluded are exactly the ones that cannot be written into source
    // as themselves.
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f && char !== '/' && char !== '\\';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return cleaned.length > 0 ? cleaned : `پیوست${extension}`;
}

/** Whether the first bytes agree with what the client said the file is. */
function signatureMatches(type: AllowedFileType, head: Uint8Array): boolean {
  return SIGNATURES[type].some(
    (signature) =>
      signature === null ||
      (head.length >= signature.length && signature.every((byte, at) => head[at] === byte))
  );
}

/**
 * Validates a batch and writes it, or writes nothing at all.
 *
 * Every file is checked before the first one is written, so a rejected fifth
 * attachment does not leave four behind — the caller would have no way to know
 * they existed. Bytes are read here rather than streamed because the per-file
 * cap is 10 MB and the signature check needs the head anyway; a streaming
 * writer would have to buffer the same bytes to make the same decision.
 */
export async function storeUploads(files: File[]): Promise<StoredFile[]> {
  if (files.length === 0) {
    throw Errors.validation(
      [{ path: 'files', message: 'فایلی برای ارسال انتخاب نشده است.' }],
      'فایلی برای ارسال انتخاب نشده است.'
    );
  }

  if (files.length > UPLOAD.maxFilesPerMessage) {
    throw Errors.validation(
      [{ path: 'files', message: `هر پیام حداکثر ${UPLOAD.maxFilesPerMessage} پیوست می‌پذیرد.` }],
      `هر پیام حداکثر ${UPLOAD.maxFilesPerMessage} پیوست می‌پذیرد.`
    );
  }

  const prepared: (StoredFile & { bytes: Uint8Array })[] = [];

  for (const file of files) {
    const reject = (message: string) =>
      Errors.validation([{ path: 'files', message }], `«${file.name}»: ${message}`);

    if (file.size === 0) throw reject('فایل خالی است.');
    if (file.size > UPLOAD.maxFileBytes) throw reject('حجم فایل بیش از حد مجاز است.');

    // `file.type` is whatever the browser put in the part header. Checked
    // against the allowlist first because an unlisted type should be refused
    // before its bytes are read at all.
    const type = file.type.split(';')[0]?.trim() ?? '';
    if (!isAllowedFileType(type)) throw reject('این نوع فایل پذیرفته نمی‌شود.');

    const bytes = new Uint8Array(await file.arrayBuffer());

    // Re-checked against what actually arrived: `file.size` is a header field,
    // and the cap has to hold against the bytes, not against a claim.
    if (bytes.byteLength > UPLOAD.maxFileBytes) throw reject('حجم فایل بیش از حد مجاز است.');

    if (!signatureMatches(type, bytes.subarray(0, 8))) {
      throw reject('محتوای فایل با نوع اعلام‌شدهٔ آن هم‌خوانی ندارد.');
    }

    const extension = ALLOWED_FILE_TYPES[type];

    prepared.push({
      // Sharded by month: one directory holding a whole institution's uploads
      // is slow to list and unpleasant to back up. The name is a fresh UUIDv7,
      // so it sorts by upload time and collides with nothing.
      fileUrl: `${new Date().toISOString().slice(0, 7)}/${Bun.randomUUIDv7()}${extension}`,
      fileName: safeDisplayName(file.name, extension),
      fileType: type,
      fileSize: bytes.byteLength,
      bytes,
    });
  }

  const written: string[] = [];

  try {
    for (const { fileUrl, bytes } of prepared) {
      const absolute = join(ROOT, fileUrl);
      await mkdir(join(absolute, '..'), { recursive: true });
      await Bun.write(absolute, bytes);
      written.push(fileUrl);
    }
  } catch (error) {
    // A half-written batch is worse than none: the message it belonged to will
    // never be created, so nothing would ever reference these again.
    await removeStored(written);
    throw error;
  }

  return prepared.map(({ bytes: _bytes, ...stored }) => stored);
}

/**
 * The absolute path of a stored file.
 *
 * `fileUrl` comes out of the database and was generated by `storeUploads`, so
 * it cannot contain `..` — this checks anyway. The cost is one string compare
 * and the alternative is that a single bad migration or a hand-edited row turns
 * the download route into an arbitrary-file reader.
 */
export function resolveStored(fileUrl: string): string {
  const absolute = resolve(ROOT, fileUrl);

  if (absolute !== ROOT && !absolute.startsWith(ROOT + sep)) {
    throw Errors.notFound('این فایل در دسترس نیست.');
  }

  return absolute;
}

/**
 * Deletes stored files, best effort.
 *
 * Never throws. Every caller is finishing something that has already succeeded
 * — a message deleted, a transaction rolled back — and failing that operation
 * because a file was already gone would turn a tidying step into an outage.
 * What is left behind is an unreferenced blob, which costs disk and nothing
 * else.
 */
export async function removeStored(fileUrls: string[]): Promise<void> {
  await Promise.all(
    fileUrls.map(async (fileUrl) => {
      try {
        await unlink(resolveStored(fileUrl));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error('[storage] could not remove', fileUrl, error);
        }
      }
    })
  );
}
