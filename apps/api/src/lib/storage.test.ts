import { UPLOAD } from '@repo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from './errors';
import { removeStored, storeUploads } from './storage';

/**
 * The upload policy, tested against a bucket that is a `Map`.
 *
 * `s3.ts` is mocked out on purpose. What is worth testing here is the set of
 * rules that decide whether bytes are allowed to become an attachment at all —
 * a filename that is a path, a content type that is a lie, a batch whose last
 * file is bad — and none of that involves the network. A suite that reached a
 * real bucket would be slower, would need credentials, and would still be
 * testing exactly these branches. The end-to-end suite covers the round trip.
 *
 * The fake records what it was asked to store, which is what lets the
 * all-or-nothing case assert on an empty bucket rather than on an empty
 * directory.
 */

const bucket = vi.hoisted(() => new Map<string, { bytes: Uint8Array; mimeType: string }>());

vi.mock('./s3', () => ({
  s3Storage: {
    bucket: 'test-bucket',
    uploadFile: vi.fn(async (bytes: Uint8Array, mimeType: string, fileName: string) => {
      const key = `${new Date().toISOString().slice(0, 7)}/${Bun.randomUUIDv7()}/${fileName}`;
      bucket.set(key, { bytes, mimeType });
      return key;
    }),
    deleteFile: vi.fn(async (key: string) => bucket.delete(key)),
  },
}));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const ZIP = [0x50, 0x4b, 0x03, 0x04];

/** Every OOXML document is a zip, so a .docx must present the zip signature. */
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** A file whose bytes start with `signature` and are padded out to `size`. */
function file(name: string, type: string, signature: number[], size = signature.length + 16): File {
  const bytes = new Uint8Array(size);
  bytes.set(signature);
  return new File([bytes], name, { type });
}

/** Runs `storeUploads` and returns the AppError it threw. */
async function rejection(files: File[]): Promise<AppError> {
  try {
    await storeUploads(files);
  } catch (error) {
    return error as AppError;
  }
  throw new Error('expected storeUploads to reject');
}

beforeEach(() => bucket.clear());

describe('storeUploads — what it accepts', () => {
  it('stores a valid image and reports where it went', async () => {
    const [stored] = await storeUploads([file('photo.png', 'image/png', PNG)]);

    expect(stored?.fileType).toBe('image/png');
    expect(stored?.fileName).toBe('photo.png');
    expect(stored?.fileSize).toBe(PNG.length + 16);
    expect(stored?.s3Bucket).toBe('test-bucket');
    // Sharded by month, then a UUIDv7 nobody can guess, then the display name —
    // which is the segment the browser saves the file as.
    expect(stored?.s3ObjectKey).toMatch(/^\d{4}-\d{2}\/[0-9a-f-]{36}\/photo\.png$/);
    expect(bucket.has(stored!.s3ObjectKey)).toBe(true);
  });

  it('uploads the bytes under the verified content type', async () => {
    // What the store is told is what the store sends back, and the presigned
    // URL repeats it. A type taken from anywhere but the verified declaration
    // would undo the signature check two lines above it.
    const [stored] = await storeUploads([file('doc.pdf', 'application/pdf', PDF)]);
    expect(bucket.get(stored!.s3ObjectKey)?.mimeType).toBe('application/pdf');
  });

  it('stores a whole batch under distinct keys', async () => {
    const stored = await storeUploads([
      file('a.png', 'image/png', PNG),
      file('b.pdf', 'application/pdf', PDF),
      file('c.docx', DOCX, ZIP),
    ]);

    expect(stored).toHaveLength(3);
    expect(new Set(stored.map((s) => s.s3ObjectKey)).size).toBe(3);
    expect(bucket.size).toBe(3);
  });

  it('accepts any bytes for text/plain, which has no signature', async () => {
    const stored = await storeUploads([
      new File([new Uint8Array([0x00, 0x01])], 'notes.txt', { type: 'text/plain' }),
    ]);
    expect(stored[0]?.fileType).toBe('text/plain');
  });

  it('ignores the charset a browser appends to the content type', async () => {
    const stored = await storeUploads([
      new File([new Uint8Array([0x68, 0x69])], 'notes.txt', { type: 'text/plain; charset=utf-8' }),
    ]);
    expect(stored[0]?.fileType).toBe('text/plain');
  });

  it('takes a file exactly at the size limit', async () => {
    const stored = await storeUploads([file('big.png', 'image/png', PNG, UPLOAD.maxFileBytes)]);
    expect(stored[0]?.fileSize).toBe(UPLOAD.maxFileBytes);
  });

  it('keeps a Persian filename intact, all the way into the key', async () => {
    // Object keys are UTF-8 and the display name is the last segment of one, so
    // «گزارش» has to survive both the sanitizer and the round trip. If it did
    // not, every attachment in this platform would be saved under a mangled name.
    const [stored] = await storeUploads([file('گزارش کلاس.pdf', 'application/pdf', PDF)]);

    expect(stored?.fileName).toBe('گزارش کلاس.pdf');
    expect(stored?.s3ObjectKey.endsWith('/گزارش کلاس.pdf')).toBe(true);
  });
});

describe('storeUploads — the client does not decide what a file is called', () => {
  it('appends the allowlist extension when the name lacks it', async () => {
    // The one with teeth. `text/plain` has no signature to check, so a real
    // executable can be uploaded as one — but it lands in a classmate's
    // Downloads folder named `setup.exe.txt`, which nothing runs.
    const [stored] = await storeUploads([
      new File([new Uint8Array([0x4d, 0x5a])], 'setup.exe', { type: 'text/plain' }),
    ]);

    expect(stored?.fileName).toBe('setup.exe.txt');
    expect(stored?.s3ObjectKey.endsWith('.txt')).toBe(true);
  });

  it('does not double an extension that is already right', async () => {
    const [stored] = await storeUploads([file('photo.png', 'image/png', PNG)]);
    expect(stored?.fileName).toBe('photo.png');
  });

  it('treats an upper-case extension as already correct', async () => {
    const [stored] = await storeUploads([file('REPORT.PDF', 'application/pdf', PDF)]);
    expect(stored?.fileName).toBe('REPORT.PDF');
  });

  it('does not let a filename escape into a directory of its own', async () => {
    // The name is the key's last segment, so a separator in it would silently
    // add a level to the key — and one day be joined onto a real path by
    // something downstream that assumed keys were flat.
    const [stored] = await storeUploads([file('../../../etc/passwd', 'image/png', PNG)]);

    // The dots survive; only the separators are gone. `..` between them means
    // nothing without a `/` to be relative to, and a name is allowed to be ugly
    // as long as it cannot be a path.
    expect(stored?.fileName).toBe('......etcpasswd.png');

    const segments = stored?.s3ObjectKey.split('/') ?? [];
    expect(segments).toHaveLength(3);
    expect(segments.at(-1)).toBe(stored?.fileName);
  });

  it('strips control characters from the name', async () => {
    // A newline in a filename is a header injection anywhere it is echoed, and
    // it is not something a store should be asked to key on either.
    const [stored] = await storeUploads([file('re\r\nport.pdf', 'application/pdf', PDF)]);
    expect(stored?.fileName).toBe('report.pdf');
  });

  it('falls back to a Persian name when nothing usable is left', async () => {
    const [stored] = await storeUploads([file('///', 'image/png', PNG)]);
    expect(stored?.fileName).toBe('پیوست.png');
  });

  it('replaces a name that is only a relative-path token', async () => {
    const [stored] = await storeUploads([file('..', 'image/png', PNG)]);
    expect(stored?.fileName).toBe('پیوست.png');
  });

  it('truncates an absurdly long name, then fixes the extension', async () => {
    const [stored] = await storeUploads([file(`${'a'.repeat(500)}.png`, 'image/png', PNG)]);

    // Cut to 120 — which drops the `.png` the client sent — and then given the
    // one the allowlist says this type has.
    expect(stored?.fileName).toBe(`${'a'.repeat(120)}.png`);
  });
});

describe('storeUploads — what it refuses', () => {
  it('an empty batch', async () => {
    expect((await rejection([])).status).toBe(422);
  });

  it('more attachments than a message may carry', async () => {
    const many = Array.from({ length: UPLOAD.maxFilesPerMessage + 1 }, (_, i) =>
      file(`${i}.png`, 'image/png', PNG)
    );
    expect((await rejection(many)).message).toContain(String(UPLOAD.maxFilesPerMessage));
  });

  it('an empty file', async () => {
    const empty = new File([], 'empty.png', { type: 'image/png' });
    expect((await rejection([empty])).message).toContain('خالی');
  });

  it('a file over the per-file cap', async () => {
    const huge = file('huge.png', 'image/png', PNG, UPLOAD.maxFileBytes + 1);
    expect((await rejection([huge])).message).toContain('حجم');
  });

  it('a type that is not on the allowlist', async () => {
    const script = new File([new Uint8Array([0x23, 0x21])], 'run.sh', { type: 'application/x-sh' });
    expect((await rejection([script])).status).toBe(422);
  });

  it('an SVG, however it is dressed up', async () => {
    // An SVG is a script that renders as a picture. Fetched from a signed URL
    // it is on the bucket's origin rather than this one, but it is still a
    // scriptable document served to someone who was told it was a picture.
    const svg = new File([new Uint8Array([0x3c, 0x73, 0x76, 0x67])], 'logo.svg', {
      type: 'image/svg+xml',
    });
    expect((await rejection([svg])).status).toBe(422);
  });

  it('a content type borrowed from Object.prototype', async () => {
    // `constructor` passes an allowlist checked with `in` and then indexes the
    // signature table to a function — a 500 rather than a Persian 422.
    for (const type of ['constructor', 'toString', '__proto__']) {
      const forged = new File([new Uint8Array(PNG)], 'x.png', { type });
      expect((await rejection([forged])).status, type).toBe(422);
    }
  });

  it('bytes that disagree with the declared type', async () => {
    // The declaration is a string the client typed. A JPEG announced as a PNG
    // is either a confused browser or someone probing what gets stored.
    const lying = file('photo.png', 'image/png', JPEG);
    expect((await rejection([lying])).message).toContain('هم‌خوانی');
  });

  it('a file too short to hold the signature it claims', async () => {
    const stub = new File([new Uint8Array([0x89, 0x50])], 'photo.png', { type: 'image/png' });
    expect((await rejection([stub])).status).toBe(422);
  });

  it('names the offending file in the message', async () => {
    // The batch is one request; without the name the user cannot tell which of
    // their five attachments was the problem.
    const error = await rejection([file('گزارش.png', 'image/png', JPEG)]);
    expect(error.message).toContain('گزارش.png');
  });

  it('uploads nothing at all when any file is refused', async () => {
    // A half-uploaded batch would leave objects nothing ever references: the
    // message they belonged to is never created.
    await rejection([
      file('good-1.png', 'image/png', PNG),
      file('good-2.pdf', 'application/pdf', PDF),
      file('bad.png', 'image/png', JPEG),
    ]);

    expect(bucket.size).toBe(0);
  });
});

describe('storeUploads — all or nothing', () => {
  it('removes what it already uploaded when a later upload fails', async () => {
    // The validation loop cannot catch this one: every file passed, and the
    // bucket refused the third anyway. Whatever got in has to come back out,
    // because the message that would have referenced it is never created.
    const { s3Storage } = await import('./s3');
    const upload = vi.mocked(s3Storage.uploadFile);
    const realImplementation = upload.getMockImplementation()!;

    upload.mockImplementationOnce(realImplementation).mockImplementationOnce(async () => {
      throw new Error('bucket unreachable');
    });

    await expect(
      storeUploads([file('a.png', 'image/png', PNG), file('b.png', 'image/png', PNG)])
    ).rejects.toThrow('bucket unreachable');

    expect(bucket.size).toBe(0);
  });
});

describe('removeStored', () => {
  it('deletes what it is given', async () => {
    const [stored] = await storeUploads([file('temp.png', 'image/png', PNG)]);

    await removeStored([stored!.s3ObjectKey]);

    expect(bucket.has(stored!.s3ObjectKey)).toBe(false);
  });

  it('accepts an empty list', async () => {
    await expect(removeStored([])).resolves.toBeUndefined();
  });

  it('never throws, whatever the bucket does', async () => {
    // Every caller is finishing something that already succeeded. Failing that
    // because the bucket was unreachable turns tidying up into an outage.
    const { s3Storage } = await import('./s3');
    vi.mocked(s3Storage.deleteFile).mockRejectedValueOnce(new Error('bucket unreachable'));

    await expect(removeStored(['2026-08/never/existed.png'])).resolves.toBeUndefined();
  });
});
