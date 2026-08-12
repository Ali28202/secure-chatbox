import { getAttachments } from './support/db';
import { expect, test } from './support/fixtures';
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

    // A name with a path in it, which is the shape of the attack: if any part of
    // it reached the filesystem, the upload would land outside the storage root.
    await fileInput(student.page).setInputFiles({
      name: '../../etc/passwd.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();
    await expect(student.page.locator('[data-slot="message"]')).toHaveCount(1);

    const [attachment] = await getAttachments(await messageId(student.page));
    expect(attachment).toBeDefined();

    // The stored path is a generated UUID under a month directory, with the
    // extension taken from the declared type and not from the name.
    expect(attachment!.fileUrl).toMatch(/^\d{4}-\d{2}\/[0-9a-f-]{36}\.png$/);

    // The display name keeps something readable but loses its separators, so it
    // can never be reassembled into a path.
    expect(attachment!.fileName).not.toContain('/');
    expect(attachment!.fileName).not.toContain('\\');
    expect(attachment!.fileType).toBe('image/png');
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
  test('serves the file to a member and nobody else', async ({ student, newSession, browser }) => {
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

    // The recipient can read it.
    expect((await peer.api.raw().get(href!)).status()).toBe(200);

    // Someone in neither side of the conversation cannot, and gets the same
    // answer as for a file that does not exist.
    expect((await outsider.api.raw().get(href!)).status()).toBe(404);

    // Nor can someone with no session at all — the attachment route is behind
    // the same wall as everything else, not a public static path.
    const anonymous = await browser.newContext();
    expect((await anonymous.request.get(href!)).status()).toBe(401);
    await anonymous.close();
  });
});
