import { describe, expect, it } from 'vitest';
import { LIMITS } from '../constants';
import { cursorPaginationSchema } from './common';
import {
  markReadSchema,
  pinMessageSchema,
  sendMessageSchema,
  uploadMessageSchema,
} from './message';

const UUID = '0199a0c1-6d3f-7000-8000-000000000001';

describe('sendMessageSchema', () => {
  it('accepts a plain message', () => {
    const result = sendMessageSchema.safeParse({ content: 'سلام استاد' });
    expect(result.success && result.data).toEqual({ content: 'سلام استاد' });
  });

  it('trims before measuring, so whitespace is not a message', () => {
    expect(sendMessageSchema.safeParse({ content: '   \n  ' }).success).toBe(false);

    const padded = sendMessageSchema.safeParse({ content: '  سلام  ' });
    expect(padded.success && padded.data.content).toBe('سلام');
  });

  it('rejects an empty string with a Persian message', () => {
    const result = sendMessageSchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('پیام نمی‌تواند خالی باشد.');
  });

  it('holds the ceiling at the shared limit', () => {
    expect(
      sendMessageSchema.safeParse({ content: 'x'.repeat(LIMITS.messageContent.max) }).success
    ).toBe(true);
    expect(
      sendMessageSchema.safeParse({ content: 'x'.repeat(LIMITS.messageContent.max + 1) }).success
    ).toBe(false);
  });

  it('carries an optional reply target, which must be a uuid', () => {
    expect(sendMessageSchema.safeParse({ content: 'بله', replyToId: UUID }).success).toBe(true);
    expect(sendMessageSchema.safeParse({ content: 'بله', replyToId: '42' }).success).toBe(false);
  });
});

describe('uploadMessageSchema', () => {
  it('allows a file with no caption', () => {
    // The one difference from `sendMessageSchema`, and the reason it exists: a
    // photo posted without text is an ordinary thing to send. The route pairs
    // this with an "at least one file" check.
    const result = uploadMessageSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.success && result.data.content).toBeUndefined();
  });

  it('still enforces the ceiling on a caption that is present', () => {
    expect(
      uploadMessageSchema.safeParse({ content: 'x'.repeat(LIMITS.messageContent.max + 1) }).success
    ).toBe(false);
  });
});

describe('markReadSchema', () => {
  it('takes the newest message the client has shown', () => {
    expect(markReadSchema.safeParse({ upToMessageId: UUID }).success).toBe(true);
    expect(markReadSchema.safeParse({}).success).toBe(false);
  });
});

describe('pinMessageSchema', () => {
  it('states the target state rather than toggling', () => {
    // Idempotence: sending `true` twice pins once. A toggle would make the
    // result depend on how many times the request arrived.
    expect(pinMessageSchema.safeParse({ isPinned: true }).success).toBe(true);
    expect(pinMessageSchema.safeParse({ isPinned: false }).success).toBe(true);
    expect(pinMessageSchema.safeParse({}).success).toBe(false);
  });
});

describe('cursorPaginationSchema', () => {
  it('defaults to a full page with no cursor', () => {
    const result = cursorPaginationSchema.safeParse({});
    expect(result.success && result.data).toEqual({ limit: LIMITS.page.default });
  });

  it('coerces the limit, because a query string has no numbers in it', () => {
    const result = cursorPaginationSchema.safeParse({ limit: '20' });
    expect(result.success && result.data.limit).toBe(20);
  });

  it('caps the page size a client may ask for', () => {
    // Without the ceiling, `?limit=100000` is a request to serialize a whole
    // chat's history into one response.
    expect(cursorPaginationSchema.safeParse({ limit: String(LIMITS.page.max) }).success).toBe(true);
    expect(cursorPaginationSchema.safeParse({ limit: String(LIMITS.page.max + 1) }).success).toBe(
      false
    );
    expect(cursorPaginationSchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('rejects a non-numeric or fractional limit', () => {
    expect(cursorPaginationSchema.safeParse({ limit: 'many' }).success).toBe(false);
    expect(cursorPaginationSchema.safeParse({ limit: '1.5' }).success).toBe(false);
  });

  it('requires the cursor to be a message id', () => {
    expect(cursorPaginationSchema.safeParse({ before: UUID }).success).toBe(true);
    expect(cursorPaginationSchema.safeParse({ before: 'yesterday' }).success).toBe(false);
  });
});
