import { ALLOWED_FILE_TYPES, isAllowedFileType, UPLOAD, type AllowedFileType } from '@repo/shared';
import { Errors } from './errors';
import { s3Storage } from './s3';

export interface StoredFile {
  s3Bucket: string;
  s3ObjectKey: string;
  fileName: string;
  fileType: AllowedFileType;
  fileSize: number;
}

const SIGNATURES: Record<AllowedFileType, (number[] | null)[]> = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/gif': [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
  ],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46, 0x2d]],
  'text/plain': [null],
  'application/zip': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    [0x50, 0x4b, 0x03, 0x04],
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
    [0x50, 0x4b, 0x03, 0x04],
  ],
  'application/msword': [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
  'application/vnd.ms-excel': [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
  'application/vnd.ms-powerpoint': [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
};

function safeDisplayName(name: string, extension: string): string {
  const cleaned = [...name]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f && char !== '/' && char !== '\\';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') {
    return `پیوست${extension}`;
  }

  return cleaned.toLowerCase().endsWith(extension) ? cleaned : `${cleaned}${extension}`;
}

function signatureMatches(type: AllowedFileType, head: Uint8Array): boolean {
  return SIGNATURES[type].some(
    (signature) =>
      signature === null ||
      (head.length >= signature.length && signature.every((byte, at) => head[at] === byte))
  );
}

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

    const type = file.type.split(';')[0]?.trim() ?? '';
    if (!isAllowedFileType(type)) throw reject('این نوع فایل پذیرفته نمی‌شود.');

    const bytes = new Uint8Array(await file.arrayBuffer());

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
    await removeStored(stored.map((file) => file.s3ObjectKey));
    throw error;
  }

  return stored;
}

export async function removeStored(s3ObjectKeys: string[]): Promise<void> {
  await Promise.all(s3ObjectKeys.map((key) => s3Storage.deleteFile(key).catch(() => false)));
}
