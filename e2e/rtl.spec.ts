import { createAccount } from './support/db';
import { expect, test } from './support/fixtures';
import type { Page } from '@playwright/test';

function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('http')) urls.push(request.url());
  });
  return urls;
}

test.describe('the document', () => {
  test('declares Persian and right-to-left, signed in or not', async ({ page, student }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await student.page.goto('/chats');
    await expect(student.page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(await student.page.evaluate(() => getComputedStyle(document.body).direction)).toBe(
      'rtl'
    );
  });

  test('asks the network for nothing outside the campus', async ({ student, newSession }) => {
    const peer = await newSession('PROFESSOR');
    const chat = await student.api.createDirectChat(peer.account.id);
    await peer.api.sendMessage(chat.id, 'سلام');

    const requested = recordRequests(student.page);

    await student.page.goto('/chats');
    await student.page.goto(`/chats/${chat.id}`);
    await expect(student.page.getByText('سلام')).toBeVisible();

    const external = requested.filter((url) => {
      const { hostname } = new URL(url);
      return hostname !== 'localhost' && hostname !== '127.0.0.1';
    });

    expect(external).toEqual([]);
    expect(requested.length).toBeGreaterThan(0);
  });

  test('renders in the typeface it ships with', async ({ student }) => {
    const requested = recordRequests(student.page);

    await student.page.goto('/chats');
    await expect(student.page.getByRole('heading', { name: 'گفت‌وگوها' })).toBeVisible();

    const family = await student.page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family).toMatch(/vazirmatn/i);

    expect(requested.some((url) => /\/_next\/static\/media\/.*\.woff2/.test(url))).toBe(true);
  });
});

test.describe('the layout', () => {
  test('puts your messages on the right and theirs on the left', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('PROFESSOR');
    const chat = await student.api.createDirectChat(peer.account.id);
    await peer.api.sendMessage(chat.id, 'پیام استاد');
    await student.api.sendMessage(chat.id, 'پیام دانشجو');

    await student.page.goto(`/chats/${chat.id}`);

    const list = student.page.locator('[data-slot="message-list"]');
    await expect(student.page.getByText('پیام دانشجو')).toBeVisible();

    const bounds = (await list.boundingBox())!;
    const middle = bounds.x + bounds.width / 2;

    const own = (await student.page.getByText('پیام دانشجو').boundingBox())!;
    const theirs = (await student.page.getByText('پیام استاد').boundingBox())!;

    expect(own.x + own.width / 2).toBeGreaterThan(middle);
    expect(theirs.x + theirs.width / 2).toBeLessThan(middle);
  });

  test('keeps a menu in the same direction as the page it belongs to', async ({ student }) => {
    await student.page.goto('/chats');
    await student.page.getByRole('button', { name: 'حساب کاربری' }).click();

    const item = student.page.getByRole('menuitem', { name: 'خروج از حساب' });
    await expect(item).toBeVisible();

    expect(await item.evaluate((node) => getComputedStyle(node).direction)).toBe('rtl');
  });
});

test.describe('numbers', () => {
  test('are Persian everywhere they are read as prose', async ({ professor, newSession }) => {
    const attendee = await newSession('STUDENT');
    const chat = await professor.api.createGroup('مبانی شبکه', [attendee.account.id]);
    await professor.api.sendMessage(chat.id, 'خوش آمدید');

    await professor.page.goto(`/chats/${chat.id}`);

    await expect(professor.page.getByRole('button', { name: '۲ عضو' })).toBeVisible();

    const clock = await professor.page.locator('[data-slot="message"] time').first().innerText();
    expect(clock).not.toMatch(/[0-9]/);
    expect(clock).toMatch(/[۰-۹]/);
  });

  test('keep their own direction when the number is a Latin identifier', async ({ student }) => {
    const peer = await createAccount('PROFESSOR', { name: 'دکتر نمونه' });

    await student.page.goto('/chats');
    await student.page.getByRole('button', { name: 'گفت‌وگوی جدید' }).click();

    const dialog = student.page.getByRole('dialog');
    await dialog.getByLabel('جست‌وجوی کاربرها').fill(peer.universityId);

    const id = dialog.getByText(peer.universityId, { exact: true });
    await expect(id).toHaveAttribute('dir', 'ltr');
  });
});
