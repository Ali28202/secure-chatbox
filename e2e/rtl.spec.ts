import { createAccount } from './support/db';
import { expect, test } from './support/fixtures';
import type { Page } from '@playwright/test';

/**
 * Persian, right-to-left, and entirely self-hosted.
 *
 * Three of the project's requirements meet in this file, and none of them can
 * be checked anywhere but in a browser. Whether the layout mirrors is a
 * question about resolved CSS logical properties and real geometry; whether the
 * typeface arrives is a question about network requests; whether a number reads
 * as Persian is a question about what `Intl` did with the runtime's locale
 * data. jsdom has no layout, no font loading and a stub `Intl` — it would
 * answer all three cheerfully and wrongly.
 *
 * The self-hosting one is the requirement with teeth. The platform runs on a
 * campus LAN with no route to the internet, so a stylesheet or a font pulled
 * from a CDN does not degrade — it hangs until it times out, on every page, for
 * every user. That failure never appears on a developer's machine, which has
 * internet. It appears on the day of the demo.
 */

/** Every http(s) URL the page asked for, from navigation onwards. */
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

    // Both on `<html>` rather than on a wrapper, so the direction is in place
    // before any of the application renders and nothing below has to restate
    // it.
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

    // The list and a conversation, so the fonts, the icons and every route's
    // own assets are all in the sample.
    await student.page.goto('/chats');
    await student.page.goto(`/chats/${chat.id}`);
    await expect(student.page.getByText('سلام')).toBeVisible();

    const external = requested.filter((url) => {
      const { hostname } = new URL(url);
      return hostname !== 'localhost' && hostname !== '127.0.0.1';
    });

    // `fonts.gstatic.com` is the one that would be there — it is what
    // `next/font/google` fetches, and `lib/fonts.ts` deliberately does not use
    // it. Written as "nothing external" rather than as a denylist because the
    // requirement is the general one.
    expect(external).toEqual([]);
    expect(requested.length).toBeGreaterThan(0);
  });

  test('renders in the typeface it ships with', async ({ student }) => {
    const requested = recordRequests(student.page);

    await student.page.goto('/chats');
    await expect(student.page.getByRole('heading', { name: 'گفت‌وگوها' })).toBeVisible();

    // `next/font/local` rewrites the family to a hashed name — `__vazirmatn_…`
    // — so the assertion is on the stem rather than on an exact string.
    const family = await student.page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family).toMatch(/vazirmatn/i);

    // And the bytes came from this server. A correct `font-family` naming a
    // file that never arrives leaves every screen in the fallback.
    expect(requested.some((url) => /\/_next\/static\/media\/.*\.woff2/.test(url))).toBe(true);
  });
});

test.describe('the layout', () => {
  test('mirrors: your messages on the left, theirs on the right', async ({
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

    // The mirror image of what a Latin messenger does, and the right way round
    // for a Persian one: the conversation runs from the right, so the incoming
    // side starts there and your own replies hang off the far edge. This is the
    // assertion that would fail if `dir="rtl"` were dropped — every logical
    // property in the stylesheet would resolve the other way and nothing else
    // in the suite would notice.
    expect(own.x + own.width / 2).toBeLessThan(middle);
    expect(theirs.x + theirs.width / 2).toBeGreaterThan(middle);
  });

  test('keeps a menu in the same direction as the page it belongs to', async ({ student }) => {
    await student.page.goto('/chats');
    await student.page.getByRole('button', { name: 'حساب کاربری' }).click();

    const item = student.page.getByRole('menuitem', { name: 'خروج از حساب' });
    await expect(item).toBeVisible();

    // Menus are portalled to the end of `<body>`, which is the usual way for a
    // popup to end up outside whatever set the direction and quietly render
    // left-to-right on an otherwise mirrored page.
    expect(await item.evaluate((node) => getComputedStyle(node).direction)).toBe('rtl');
  });
});

test.describe('numbers', () => {
  test('are Persian everywhere they are read as prose', async ({ professor, newSession }) => {
    const attendee = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'مبانی شبکه', [
      attendee.account.id,
    ]);
    await professor.api.sendMessage(chat.id, 'خوش آمدید');

    await professor.page.goto(`/chats/${chat.id}`);

    // Counted by hand into Persian prose…
    await expect(professor.page.getByRole('button', { name: '۲ عضو' })).toBeVisible();

    // …and formatted by `Intl` with the `fa` locale, which is where the clock
    // and the Jalali calendar come from. Two different mechanisms, so both are
    // worth asserting: the digits are the visible half of «۱۴ مرداد» rather
    // than «August 5».
    const clock = await professor.page.locator('[data-slot="message"] time').first().innerText();
    expect(clock).not.toMatch(/[0-9]/);
    expect(clock).toMatch(/[۰-۹]/);
  });

  test('keep their own direction when the number is a Latin identifier', async ({ student }) => {
    const peer = await createAccount('PROFESSOR', { name: 'دکتر نمونه' });

    await student.page.goto('/chats');
    await student.page.getByRole('button', { name: 'گفت‌وگوی جدید' }).click();

    const dialog = student.page.getByRole('dialog');
    await dialog.getByLabel('جست‌وجوی کاربران').fill(peer.universityId);

    // A university ID is Latin digits inside Persian text, and in an RTL run
    // the bidi algorithm moves the pieces of it around — «۹۸۱۲۳» typed as
    // `98123` can render with its parts transposed next to punctuation. The
    // `dir` on the span is what pins it.
    const id = dialog.getByText(peer.universityId, { exact: true });
    await expect(id).toHaveAttribute('dir', 'ltr');
  });
});
