import { ALLOWED_FILE_TYPES, isAllowedFileType, UPLOAD, type AllowedFileType } from '@repo/shared';
import { Errors } from './errors';
import { s3Storage } from './s3';

/**
 * What may become an attachment.
 *
 * Every rule about what is allowed to be stored lives here, on the near side of
 * the only function that uploads anything. The service above decides *whether* a
 * message may be sent; this decides what is allowed to become an object, and it
 * assumes the request is hostile — a filename, a content type and a size are all
 * just strings a client chose to send.
 *
 * `s3.ts` does the storing. The split is deliberate: swapping AWS for a bucket
 * on the university's own network changes that file and none of this one, and
 * the rules below are the part that would be dangerous to lose in such a move.
 *
 * Three rules do most of the work:
 *
 *   1. The object key is generated, never assembled from anything the client
 *      sent, so no upload can choose where it lands or replace another.
 *   2. The stored name always ends in the allowlist's extension for the type
 *      that was verified — appended if the uploaded name did not already have
 *      it. A client cannot decide what a downloaded file is called.
 *   3. Where a type has a reliable signature, the bytes must agree with the
 *      declaration before anything is uploaded.
 */

export interface StoredFile {
  /** Which bucket the object went to — stored per row, so a later move is readable. */
  s3Bucket: string;
  /** The object's key within that bucket. Generated here; never client input. */
  s3ObjectKey: string;
  fileName: string;
  fileType: AllowedFileType;
  fileSize: number;
}

/**
 * Leading bytes each type must actually start with.
 *
 * A declared `Content-Type` is worth nothing on its own: a multipart part
 * carries whatever the client typed there. This does not make the upload safe
 * on its own either — the store's `Content-Type` on the way back out is what
 * decides how a browser treats it — but it is what stops the *stored* record
 * from lying about its own contents, and it is three lines.
 *
 * `null` marks a type with no signature worth checking. `text/plain` is any
 * bytes at all by definition, so the allowlist carries it alone.
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
 * The uploaded name, reduced to something safe to store, to echo back, and to
 * use as the last segment of an object key.
 *
 * That last use is new and is why the rules here matter more than they did when
 * attachments were files on a disk. The key is what the browser saves the file
 * as — a signed URL cannot carry a `Content-Disposition` — so the name has to
 * survive into it, and a name is a string a client chose.
 *
 * Separators go because a key is a path-shaped string and a name containing one
 * would silently add a directory level. Control characters go because the name
 * is rendered in a browser and percent-encoded into a URL. A name that reduces
 * to nothing, or to a relative-path token, is replaced outright.
 *
 * And the extension is *made* to match the type the bytes were checked against.
 * This is the part that has teeth. `text/plain` has no signature to verify — any
 * bytes at all are a valid text file — so without this rule someone could upload
 * a Windows executable, declare it `text/plain`, call it `setup.exe`, and the
 * platform would hand every member of the chat a file that runs when they
 * double-click it. Appending `.txt` is the whole fix: what lands in a
 * classmate's Downloads folder is named for what it was allowed to be.
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

  // `.` and `..` are legal S3 keys, but implementations differ on whether they
  // normalize them, and a key that means something different to the store than
  // to the row that records it is not worth the saving.
  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') {
    return `پیوست${extension}`;
  }

  // Case-insensitively, because `REPORT.PDF` is already a PDF and appending to
  // it would be pedantry rather than safety.
  return cleaned.toLowerCase().endsWith(extension) ? cleaned : `${cleaned}${extension}`;
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
 * Validates a batch and uploads it, or uploads nothing at all.
 *
 * Every file is checked before the first one leaves the process, so a rejected
 * fifth attachment does not leave four objects in the bucket — the caller would
 * have no way to know they existed. Bytes are read here rather than streamed
 * because the per-file cap is 10 MB and the signature check needs the head
 * anyway; a streaming upload would have to buffer the same bytes to make the
 * same decision.
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

  const prepared: (Omit<StoredFile, 's3Bucket' | 's3ObjectKey'> & { bytes: Uint8Array })[] = [];

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

    prepared.push({
      fileName: safeDisplayName(file.name, ALLOWED_FILE_TYPES[type]),
      fileType: type,
      fileSize: bytes.byteLength,
      bytes,
    });
  }

  const stored: StoredFile[] = [];

  try {
    for (const { bytes, ...file } of prepared) {
      const s3ObjectKey = await s3Storage.uploadFile(bytes, file.fileType, file.fileName);
      stored.push({ ...file, s3Bucket: s3Storage.bucket, s3ObjectKey });
    }
  } catch (error) {
    // A half-uploaded batch is worse than none: the message it belonged to will
    // never be created, so nothing would ever reference these again.
    await removeStored(stored.map((file) => file.s3ObjectKey));
    throw error;
  }

  return stored;
}

/**
 * Deletes stored objects, best effort.
 *
 * Never throws. Every caller is finishing something that has already succeeded
 * — a message deleted, a transaction rolled back — and failing that because the
 * bucket was briefly unreachable would turn a tidying step into an outage. What
 * is left behind is an object no row names, which costs storage and nothing
 * else.
 *
 * `deleteFile` already swallows; the `catch` is here anyway so the guarantee is
 * enforced where it is promised rather than borrowed from another file.
 */
export async function removeStored(s3ObjectKeys: string[]): Promise<void> {
  await Promise.all(s3ObjectKeys.map((key) => s3Storage.deleteFile(key).catch(() => false)));
}
