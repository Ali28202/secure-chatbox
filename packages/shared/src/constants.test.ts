import { describe, expect, it } from 'vitest';
import {
  ALLOWED_FILE_TYPES,
  FILE_ACCEPT,
  isAllowedFileType,
  isImageType,
  LIMITS,
  UPLOAD,
} from './constants';

describe('isAllowedFileType', () => {
  it('accepts every type in the table', () => {
    for (const type of Object.keys(ALLOWED_FILE_TYPES)) {
      expect(isAllowedFileType(type)).toBe(true);
    }
  });

  it('refuses SVG, which is a script that renders as a picture', () => {
    // The obvious omission from an image allowlist, and the one worth stating:
    // an `<svg>` can carry `<script>`, so serving one from the platform's own
    // origin would be stored XSS with a thumbnail.
    expect(isAllowedFileType('image/svg+xml')).toBe(false);
  });

  it('refuses executables and archives that are not zip', () => {
    for (const type of [
      'application/x-msdownload',
      'application/x-sh',
      'application/x-httpd-php',
      'text/html',
      'application/x-rar-compressed',
    ]) {
      expect(isAllowedFileType(type)).toBe(false);
    }
  });

  it('is an exact lookup, not a prefix or case-insensitive one', () => {
    // `in` on the table means no `startsWith` surprises: a type that merely
    // begins with an allowed one is a different type.
    expect(isAllowedFileType('image/png; charset=binary')).toBe(false);
    expect(isAllowedFileType('IMAGE/PNG')).toBe(false);
    expect(isAllowedFileType('')).toBe(false);
  });

  it('is not fooled by properties inherited from Object.prototype', () => {
    // `type in ALLOWED_FILE_TYPES` walks the prototype chain, so these are the
    // strings that would sneak through if the object ever gained one.
    expect(isAllowedFileType('toString')).toBe(false);
    expect(isAllowedFileType('constructor')).toBe(false);
  });
});

describe('ALLOWED_FILE_TYPES', () => {
  it('maps every type to a lowercase dotted extension', () => {
    // These become the tail of a filename on disk, so a missing dot or a stray
    // path separator would land in the stored name.
    for (const extension of Object.values(ALLOWED_FILE_TYPES)) {
      expect(extension).toMatch(/^\.[a-z0-9]+$/);
    }
  });
});

describe('FILE_ACCEPT', () => {
  it('offers the picker exactly the types the server will take', () => {
    // A picker that offers more than the server accepts sends people to a
    // Persian error message after choosing a file; one that offers less hides
    // formats that would have worked.
    expect(FILE_ACCEPT.split(',')).toEqual(Object.keys(ALLOWED_FILE_TYPES));
  });
});

describe('isImageType', () => {
  it('separates what is drawn from what is listed for download', () => {
    expect(isImageType('image/png')).toBe(true);
    expect(isImageType('image/webp')).toBe(true);
    expect(isImageType('application/pdf')).toBe(false);
    expect(isImageType('text/plain')).toBe(false);
  });
});

describe('UPLOAD', () => {
  it('leaves the body limit above a full batch of maximum files', () => {
    // Deliberate slack: a request rejected at the body limit is rejected before
    // anything can say *which* file was too big, so the per-file check should
    // normally be the one that fires.
    expect(UPLOAD.maxRequestBytes).toBeGreaterThan(UPLOAD.maxFilesPerMessage * UPLOAD.maxFileBytes);
  });
});

describe('LIMITS', () => {
  it('keeps every floor below its ceiling', () => {
    for (const [field, bounds] of Object.entries(LIMITS)) {
      if ('min' in bounds) {
        expect(bounds.min, field).toBeLessThan(bounds.max);
      }
    }
  });

  it('never lets the default page size exceed the cap a client may request', () => {
    expect(LIMITS.page.default).toBeLessThanOrEqual(LIMITS.page.max);
  });
});
