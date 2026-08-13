import { getAttachments } from './support/db';
import { API_URL, E2E_S3_BUCKET, E2E_S3_ENDPOINT } from './support/env';
import { expect, test } from './support/fixtures';
import { objectExists } from './support/s3';
import type { Page } from '@playwright/test';

/**
 * Sending files, and everything the server refuses to take on trust.
 *
 * Uploads go through the real composer rather than a hand-built multipart POST,
 * and not only for realism: the CSRF guard requires an `Origin` the browser sets
 * and a script would have to forge, so driving the input is also the honest way
 * to reach the endpoint. `setInputFiles` with a buffer means no fixture files in
 * the repository and no cleanup — the bytes are written by the test that needs
 * them.
 *
 * The bytes are real. `storage.ts` checks a file's leading bytes against its
 * declared type, so a placeholder named `.png` would be refused for the right
 * reason and prove nothing about the happy path.
 *
 * And the bucket is real. This is the only suite that can prove the round trip
 * an attachment actually makes — into an object store over the network, back
 * out through a signed URL that expires — because every layer of it is a
 * different process and none of them can be mocked without mocking the thing
 * under test.
 */

/** A valid 1×1 transparent PNG, signature and all. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

/** The smallest thing that satisfies the `%PDF-` check. */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

/** The hidden `<input type="file">` behind the paperclip. */
function fileInput(page: Page) {
  return page.locator('input[type="file"]');
}

/** The id of the only message on screen, for asking the database about it. */
async function messageId(page: Page): Promise<string> {
  const id = await page.locator('[data-slot="message"]').first().getAttribute('data-message-id');
  expect(id, 'expected a rendered message to read an id from').not.toBeNull();
  return id!;
}

test.describe('sending a file', () => {
  test('an image is uploaded, stored, and drawn in both windows', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('PROFESSOR');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);
    await peer.page.goto(`/chats/${chat.id}`);

    await fileInput(student.page).setInputFiles({
      name: 'نمودار کلاس.png',
      mimeType: 'image/png',
      buffer: PNG,
    });

    // Queued, not sent: the chip is the chance to change your mind.
    await expect(student.page.getByText('نمودار کلاس.png')).toBeVisible();

    await student.page.getByLabel('متن پیام').fill('این هم نمودار');
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();

    // Drawn in place rather than offered as a download, and it arrives over the
    // socket in the other window like any other message.
    await expect(peer.page.getByRole('img', { name: 'نمودار کلاس.png' })).toBeVisible();
    await expect(peer.page.getByText('این هم نمودار')).toBeVisible();
  });

  test('a document arrives as a row to download', async ({ student, newSession }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);
    await fileInput(student.page).setInputFiles({
      name: 'جزوه.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    });
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();

    await peer.page.goto(`/chats/${chat.id}`);
    await expect(peer.page.getByRole('link', { name: /جزوه\.pdf/ })).toBeVisible();
  });

  test('sends several files under one message', async ({ student, newSession }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);
    await fileInput(student.page).setInputFiles([
      { name: 'یک.png', mimeType: 'image/png', buffer: PNG },
      { name: 'دو.png', mimeType: 'image/png', buffer: PNG },
      { name: 'سه.pdf', mimeType: 'application/pdf', buffer: PDF },
    ]);
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();

    // One message carrying three files, not three messages — which is why the
    // count is asserted against the row rather than against what is on screen.
    await expect(student.page.locator('[data-slot="message"]')).toHaveCount(1);
    await expect(student.page.getByRole('img', { name: 'یک.png' })).toBeVisible();
    await expect(student.page.getByRole('img', { name: 'دو.png' })).toBeVisible();
    await expect(student.page.getByRole('link', { name: /سه\.pdf/ })).toBeVisible();

    expect(await getAttachments(await messageId(student.page))).toHaveLength(3);
  });
});

test.describe('what the server refuses to trust', () => {
  test('stores a generated name and keeps the uploader’s out of the path', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);

    // A name with a path in it, which is the shape of the attack: an object key
    // is a path-shaped string, so a separator that survived would put the upload
    // somewhere the platform did not choose.
    await fileInput(student.page).setInputFiles({
      name: '../../etc/passwd.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();
    await expect(student.page.locator('[data-slot="message"]')).toHaveCount(1);

    const [attachment] = await getAttachments(await messageId(student.page));
    expect(attachment).toBeDefined();

    // A month, a UUIDv7 nobody can guess, and the sanitized name — three
    // segments, so the separators in what was uploaded did not survive into a
    // fourth.
    expect(attachment!.s3ObjectKey).toMatch(/^\d{4}-\d{2}\/[0-9a-f-]{36}\/[^/]+\.png$/);
    expect(attachment!.s3Bucket).toBe(E2E_S3_BUCKET);

    // The display name keeps something readable but loses its separators, so it
    // can never be reassembled into a path.
    expect(attachment!.fileName).not.toContain('/');
    expect(attachment!.fileName).not.toContain('\\');
    expect(attachment!.fileType).toBe('image/png');

    // And the bytes are genuinely in the bucket, under exactly the key the row
    // claims. A row that named an object nobody wrote would pass every other
    // assertion in this file and fail on the first download.
    expect(objectExists(attachment!.s3ObjectKey)).toBe(true);
  });

  test('refuses a file whose bytes disagree with its declared type', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);

    // The browser only knows what the part header says, so the composer accepts
    // this happily. The check that matters is the one reading the bytes.
    await fileInput(student.page).setInputFiles({
      name: 'ادعای تصویر.png',
      mimeType: 'image/png',
      buffer: Buffer.from('MZ\x90\x00 this is not an image at all'),
    });
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();

    await expect(
      student.page.getByText('محتوای فایل با نوع اعلام‌شدهٔ آن هم‌خوانی ندارد.')
    ).toBeVisible();

    // Refused means refused: no message, and nothing written to disk.
    await expect(student.page.getByText('هنوز پیامی در این گفت‌وگو نیست')).toBeVisible();
  });

  test('refuses an unlisted file type before it is ever uploaded', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);
    await fileInput(student.page).setInputFiles({
      name: 'اسکریپت.sh',
      mimeType: 'application/x-sh',
      buffer: Buffer.from('#!/bin/sh\necho hello\n'),
    });

    // Caught in the browser, so the bytes never leave the machine. The API
    // enforces the same list regardless — this copy only saves the round trip.
    await expect(
      student.page.getByText('«اسکریپت.sh»: این نوع فایل پذیرفته نمی‌شود.')
    ).toBeVisible();
    await expect(student.page.getByRole('button', { name: 'ارسال پیام' })).toBeDisabled();
  });
});

test.describe('downloading', () => {
  test('hands a member a signed link and nobody else anything', async ({
    student,
    newSession,
    browser,
  }) => {
    const peer = await newSession('STUDENT');
    const outsider = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);
    await fileInput(student.page).setInputFiles({
      name: 'خصوصی.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    });
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();
    await expect(student.page.getByRole('link', { name: /خصوصی\.pdf/ })).toBeVisible();

    const href = await student.page.getByRole('link', { name: /خصوصی\.pdf/ }).getAttribute('href');
    expect(href).not.toBeNull();

    // What the recipient gets back is a redirect, not the file: the API checks
    // membership and then steps out of the way. `maxRedirects: 0` because
    // following it silently would prove only that the whole chain works and
    // never that the API stopped being a byte pump.
    const redirect = await peer.api.raw().get(href!, { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);

    // The link outlives nothing. A cached redirect would hand this member a
    // dead signature the next time they clicked.
    expect(redirect.headers()['cache-control']).toBe('no-store');

    const signed = redirect.headers()['location'];
    expect(signed, 'expected a Location header pointing into the bucket').toBeDefined();
    expect(signed).toContain(`${E2E_S3_ENDPOINT}/${E2E_S3_BUCKET}/`);
    expect(signed).toContain('X-Amz-Signature=');

    // And it really works, straight from the store, with the type the bytes
    // were checked against when they were stored.
    const anonymous = await browser.newContext();
    const download = await anonymous.request.get(signed!);
    expect(download.status()).toBe(200);
    expect(download.headers()['content-type']).toContain('application/pdf');
    expect(Buffer.from(await download.body())).toEqual(PDF);

    // The signature is the entire permission. The same object without it is
    // refused, which is what makes it safe for the URL above to travel through
    // a browser's address bar.
    expect((await anonymous.request.get(signed!.split('?')[0]!)).status()).toBe(403);

    // Someone in neither side of the conversation gets no redirect and no
    // signature — and the same answer as for a file that does not exist.
    expect((await outsider.api.raw().get(href!, { maxRedirects: 0 })).status()).toBe(404);

    // Nor does someone with no session at all: the attachment route is behind
    // the same wall as everything else, and the bucket is behind the route.
    expect((await anonymous.request.get(href!, { maxRedirects: 0 })).status()).toBe(401);

    await anonymous.close();
  });

  test('deleting a message takes its file out of the bucket', async ({ student, newSession }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);
    await fileInput(student.page).setInputFiles({
      name: 'اشتباهی.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    });
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();
    await expect(student.page.getByRole('link', { name: /اشتباهی\.pdf/ })).toBeVisible();

    const id = await messageId(student.page);
    const [attachment] = await getAttachments(id);
    expect(objectExists(attachment!.s3ObjectKey)).toBe(true);

    const deleted = await student.api
      .raw()
      .delete(`${API_URL}/api/chats/${chat.id}/messages/${id}`, { data: {} });
    expect(deleted.status()).toBe(200);

    // A soft delete leaves a tombstone in the database on purpose — reply
    // chains hang off it. The bytes are not part of that: nothing can reach
    // them any more, and a semester of deleted coursework sitting in a bucket
    // is exactly the kind of thing nobody discovers until it leaks.
    expect(await getAttachments(id)).toHaveLength(0);
    expect(objectExists(attachment!.s3ObjectKey)).toBe(false);
  });
});
