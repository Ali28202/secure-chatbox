import { readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { UPLOAD } from '@repo/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { env } from '../env';
import { AppError } from './errors';
import { removeStored, resolveStored, storeUploads } from './storage';

/**
 * The upload path, tested against the real filesystem and the real `Bun.write`.
 *
 * `UPLOAD_DIR` is pointed at a temp directory by `vitest.config.ts`, which has
 * to happen there rather than here: `storage.ts` resolves its root once, at
 * import. Everything this suite writes lands under that directory and is removed
 * at the end.
 *
 * The cases are the ones that matter if a request is hostile — a filename that
 * is a path, a content type that is a lie, a batch whose last file is bad — plus
 * the ordinary ones that prove the checks are not simply refusing everything.
 */

const ROOT = resolve(env.UPLOAD_DIR);

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

const countFiles = async (): Promise<number> => {
  try {
    return (await readdir(ROOT, { recursive: true })).length;
  } catch {
    return 0;
  }
};

afterAll(() => rm(ROOT, { recursive: true, force: true }));

describe('storeUploads — what it accepts', () => {
  it('stores a valid image and reports where it went', async () => {
    const [stored] = await storeUploads([file('photo.png', 'image/png', PNG)]);

    expect(stored?.fileType).toBe('image/png');
    expect(stored?.fileName).toBe('photo.png');
    expect(stored?.fileSize).toBe(PNG.length + 16);
    // Sharded by month, named with a UUIDv7, extension from the allowlist.
    expect(stored?.fileUrl).toMatch(/^\d{4}-\d{2}\/[0-9a-f-]{36}\.png$/);
    await expect(stat(join(ROOT, stored!.fileUrl))).resolves.toBeDefined();
  });

  it('stores a whole batch', async () => {
    const stored = await storeUploads([
      file('a.png', 'image/png', PNG),
      file('b.pdf', 'application/pdf', PDF),
      file('c.docx', DOCX, ZIP),
    ]);

    expect(stored).toHaveLength(3);
    expect(new Set(stored.map((s) => s.fileUrl)).size).toBe(3);
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
});

describe('storeUploads — the extension never comes from the client', () => {
  it('derives it from the declared type, not the filename', async () => {
    // `evil.php.png` declared as a PNG is stored as `<uuid>.png`. Nothing the
    // client sent appears in the path at all.
    const [stored] = await storeUploads([file('evil.php.png', 'image/png', PNG)]);
    expect(stored?.fileUrl.endsWith('.png')).toBe(true);
    expect(stored?.fileUrl).not.toContain('php');
  });

  it('does not let a filename escape the upload root', async () => {
    const [stored] = await storeUploads([file('../../../etc/passwd', 'image/png', PNG)]);

    expect(stored?.fileUrl).not.toContain('..');
    expect(resolve(ROOT, stored!.fileUrl).startsWith(ROOT)).toBe(true);
    // The display name keeps the text minus the separators, since it is only
    // ever rendered and put in a Content-Disposition header.
    expect(stored?.fileName).toBe('......etcpasswd');
  });

  it('strips control characters from the display name', async () => {
    // A newline in a filename is a header injection in `Content-Disposition`.
    const [stored] = await storeUploads([file('re\r\nport.pdf', 'application/pdf', PDF)]);
    expect(stored?.fileName).toBe('report.pdf');
  });

  it('falls back to a Persian name when nothing usable is left', async () => {
    const [stored] = await storeUploads([file('///', 'image/png', PNG)]);
    expect(stored?.fileName).toBe('پیوست.png');
  });

  it('truncates an absurdly long name', async () => {
    const [stored] = await storeUploads([file(`${'a'.repeat(500)}.png`, 'image/png', PNG)]);
    expect(stored?.fileName).toHaveLength(120);
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
    // An SVG is a script that renders as a picture; served from this origin it
    // would be stored XSS.
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
    // is either a confused browser or someone probing what gets written.
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
});

describe('storeUploads — all or nothing', () => {
  it('writes none of a batch when a later file is rejected', async () => {
    // A half-written batch would leave files nothing ever references: the
    // message they belonged to is never created.
    const before = await countFiles();

    await rejection([
      file('good-1.png', 'image/png', PNG),
      file('good-2.pdf', 'application/pdf', PDF),
      file('bad.png', 'image/png', JPEG),
    ]);

    expect(await countFiles()).toBe(before);
  });
});

describe('resolveStored', () => {
  it('resolves a stored path to somewhere inside the root', () => {
    expect(resolveStored('2026-08/file.png')).toBe(join(ROOT, '2026-08/file.png'));
  });

  it('refuses to climb out of the root', () => {
    // These values come out of the database, where `storeUploads` put them —
    // but a hand-edited row must not turn the download route into an
    // arbitrary-file reader.
    for (const path of ['../../../etc/passwd', '2026-08/../../../etc/shadow', '/etc/passwd']) {
      expect(() => resolveStored(path), path).toThrow(AppError);
    }
  });

  it('reports a traversal attempt as "not found", not "forbidden"', () => {
    // A 403 would confirm that something is there to be forbidden.
    try {
      resolveStored('../secrets');
    } catch (error) {
      expect((error as AppError).status).toBe(404);
    }
  });
});

describe('removeStored', () => {
  it('deletes what it is given', async () => {
    const [stored] = await storeUploads([file('temp.png', 'image/png', PNG)]);
    await removeStored([stored!.fileUrl]);
    await expect(stat(join(ROOT, stored!.fileUrl))).rejects.toThrow();
  });

  it('never throws, whatever it is handed', async () => {
    // Every caller is finishing something that already succeeded — a message
    // deleted, a transaction rolled back. Failing that because a file was
    // already gone turns tidying up into an outage.
    await expect(
      removeStored(['2026-08/never-existed.png', '../../../etc/passwd', ''])
    ).resolves.toBeUndefined();
  });

  it('accepts an empty list', async () => {
    await expect(removeStored([])).resolves.toBeUndefined();
  });
});
