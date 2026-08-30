import { getAttachments } from './support/db';
import { API_URL, E2E_S3_BUCKET, E2E_S3_ENDPOINT } from './support/env';
import { expect, test } from './support/fixtures';
import { objectExists } from './support/s3';
import type { Page } from '@playwright/test';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

function fileInput(page: Page) {
  return page.locator('input[type="file"]');
}

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

    await expect(student.page.getByText('نمودار کلاس.png')).toBeVisible();

    await student.page.getByLabel('متن پیام').fill('این هم نمودار');
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();

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

    await fileInput(student.page).setInputFiles({
      name: '../../etc/passwd.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();
    await expect(student.page.locator('[data-slot="message"]')).toHaveCount(1);

    const [attachment] = await getAttachments(await messageId(student.page));
    expect(attachment).toBeDefined();

    expect(attachment!.s3ObjectKey).toMatch(/^\d{4}-\d{2}\/[0-9a-f-]{36}\/[^/]+\.png$/);
    expect(attachment!.s3Bucket).toBe(E2E_S3_BUCKET);

    expect(attachment!.fileName).not.toContain('/');
    expect(attachment!.fileName).not.toContain('\\');
    expect(attachment!.fileType).toBe('image/png');

    expect(objectExists(attachment!.s3ObjectKey)).toBe(true);
  });

  test('refuses a file whose bytes disagree with its declared type', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);

    await fileInput(student.page).setInputFiles({
      name: 'ادعای تصویر.png',
      mimeType: 'image/png',
      buffer: Buffer.from('MZ\x90\x00 this is not an image at all'),
    });
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();

    await expect(
      student.page.getByText('محتوای فایل با نوع اعلام‌شدهٔ آن هم‌خوانی ندارد.')
    ).toBeVisible();

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

    const redirect = await peer.api.raw().get(href!, { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);

    expect(redirect.headers()['cache-control']).toBe('no-store');

    const signed = redirect.headers()['location'];
    expect(signed, 'expected a Location header pointing into the bucket').toBeDefined();
    expect(signed).toContain(`${E2E_S3_ENDPOINT}/${E2E_S3_BUCKET}/`);
    expect(signed).toContain('X-Amz-Signature=');

    const anonymous = await browser.newContext();
    const download = await anonymous.request.get(signed!);
    expect(download.status()).toBe(200);
    expect(download.headers()['content-type']).toContain('application/pdf');
    expect(Buffer.from(await download.body())).toEqual(PDF);

    expect((await anonymous.request.get(signed!.split('?')[0]!)).status()).toBe(403);

    expect((await outsider.api.raw().get(href!, { maxRedirects: 0 })).status()).toBe(404);

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

    expect(await getAttachments(id)).toHaveLength(0);
    expect(objectExists(attachment!.s3ObjectKey)).toBe(false);
  });
});
