import { COOKIE_NAMES } from '@repo/shared';
import { createAccount, withDb } from './support/db';
import { E2E_PASSWORD } from './support/env';
import { expect, test } from './support/fixtures';
import type { Page } from '@playwright/test';

/**
 * Signing in, staying signed in, and being kept out.
 *
 * This is the one spec that drives the login form itself; everywhere else the
 * fixtures authenticate over HTTP so a broken form fails here and only here.
 *
 * The route protection cases are the ones worth being careful about. There are
 * two gates and they do different jobs: `proxy.ts` reads a cookie's *presence*
 * to decide which page to render, and the API checks the *signature* to decide
 * whether to answer. A test that only proved the first would be proving that a
 * forged cookie gets you a nicer-looking rejection.
 */

/**
 * The form's own error banner.
 *
 * Scoped to the form because Next's route announcer is also `role="alert"` and
 * an unscoped query matches both — and because the banner being *inside* the
 * form is the point of `FormError`: a toast in the corner is missed by someone
 * whose attention is on the fields they just filled in.
 */
function formAlert(page: Page) {
  return page.locator('form').getByRole('alert');
}

test.describe('signing in', () => {
  test('takes a student from the form to their conversations', async ({ page }) => {
    const account = await createAccount('STUDENT');

    await page.goto('/login');
    await page.getByLabel('شناسهٔ دانشگاهی یا شمارهٔ تلفن').fill(account.universityId);
    await page.getByLabel('گذرواژه').fill(account.password);
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();

    await expect(page).toHaveURL('/chats');
    await expect(page.getByRole('heading', { name: 'گفت‌وگوها' })).toBeVisible();
    // The header renders from `/auth/me`, so seeing the name proves the API
    // accepted the cookies and not merely that the browser stored them.
    await expect(page.getByRole('button', { name: 'حساب کاربری' })).toBeVisible();
  });

  test('leaves the session cookies httpOnly, and the refresh cookie scoped', async ({ page }) => {
    const account = await createAccount('STUDENT');

    await page.goto('/login');
    await page.getByLabel('شناسهٔ دانشگاهی یا شمارهٔ تلفن').fill(account.universityId);
    await page.getByLabel('گذرواژه').fill(account.password);
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();
    await expect(page).toHaveURL('/chats');

    const cookies = await page.context().cookies();
    const byName = new Map(cookies.map((cookie) => [cookie.name, cookie]));

    // The two that carry a token cannot be read by script. The hint carries
    // nothing and is readable on purpose — it only decides which page renders.
    expect(byName.get(COOKIE_NAMES.access)?.httpOnly).toBe(true);
    expect(byName.get(COOKIE_NAMES.refresh)?.httpOnly).toBe(true);
    expect(byName.get(COOKIE_NAMES.sessionHint)).toBeDefined();

    // Scoped to the auth routes, so an ordinary API call never carries it.
    expect(byName.get(COOKIE_NAMES.refresh)?.path).toBe('/api/auth');
    expect(byName.get(COOKIE_NAMES.access)?.path).toBe('/');

    // Plain HTTP on a campus LAN: a `Secure` cookie here is one the browser
    // accepts and then silently never sends back.
    expect(byName.get(COOKIE_NAMES.access)?.secure).toBe(false);
  });

  test('accepts a phone number in the same field as a student number', async ({ page }) => {
    // One field, two identifiers. The server decides which column matched, so
    // this is the only place that proves the second one is reachable at all.
    const account = await createAccount('STUDENT');

    await page.goto('/login');
    await page.getByLabel('شناسهٔ دانشگاهی یا شمارهٔ تلفن').fill(account.phoneNumber);
    await page.getByLabel('گذرواژه').fill(account.password);
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();

    await expect(page).toHaveURL('/chats');
  });

  test('accepts a phone number typed in Persian digits', async ({ page }) => {
    // What a Persian keyboard produces. «۰۹۱۲…» and «0912…» are different
    // strings and only one of them is in the column, so the folding has to
    // happen before the lookup or this is a login that mysteriously fails.
    const account = await createAccount('STUDENT');
    const persian = account.phoneNumber.replace(/\d/g, (digit) =>
      String.fromCharCode(0x06f0 + Number(digit))
    );

    await page.goto('/login');
    await page.getByLabel('شناسهٔ دانشگاهی یا شمارهٔ تلفن').fill(persian);
    await page.getByLabel('گذرواژه').fill(account.password);
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();

    await expect(page).toHaveURL('/chats');
  });

  test('survives a hard reload', async ({ student }) => {
    await student.page.goto('/chats');
    await expect(student.page.getByRole('heading', { name: 'گفت‌وگوها' })).toBeVisible();

    await student.page.reload();
    await expect(student.page).toHaveURL('/chats');
    await expect(student.page.getByRole('heading', { name: 'گفت‌وگوها' })).toBeVisible();
  });

  test('refuses a wrong password in Persian without leaving the page', async ({ page }) => {
    const account = await createAccount('STUDENT');

    await page.goto('/login');
    await page.getByLabel('شناسهٔ دانشگاهی یا شمارهٔ تلفن').fill(account.universityId);
    await page.getByLabel('گذرواژه').fill('WrongPassword@1404');
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();

    await expect(formAlert(page)).toContainText('شناسه یا گذرواژه نادرست است.');
    await expect(page).toHaveURL('/login');
  });

  test('says the same thing about an account that does not exist', async ({ page }) => {
    // Same message, deliberately: a different one would turn the login form
    // into a way of asking which university IDs are registered.
    await page.goto('/login');
    await page.getByLabel('شناسهٔ دانشگاهی یا شمارهٔ تلفن').fill('400000000');
    await page.getByLabel('گذرواژه').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();

    await expect(formAlert(page)).toContainText('شناسه یا گذرواژه نادرست است.');
  });
});

test.describe('route protection', () => {
  test('sends an anonymous visitor to the login page, and back again after', async ({ page }) => {
    const account = await createAccount('STUDENT');

    await page.goto('/chats');
    await expect(page).toHaveURL('/login?next=%2Fchats');

    await page.getByLabel('شناسهٔ دانشگاهی یا شمارهٔ تلفن').fill(account.universityId);
    await page.getByLabel('گذرواژه').fill(account.password);
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();

    await expect(page).toHaveURL('/chats');
  });

  test('does not follow ?next= off the site', async ({ page }) => {
    const account = await createAccount('STUDENT');

    // `safeRedirectTarget` discards anything that is not a plain in-app path;
    // without it the login page would be an open redirect with a real login
    // form on it, which is the most convincing kind.
    await page.goto('/login?next=https%3A%2F%2Fevil.example%2Fsteal');
    await page.getByLabel('شناسهٔ دانشگاهی یا شمارهٔ تلفن').fill(account.universityId);
    await page.getByLabel('گذرواژه').fill(account.password);
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();

    await expect(page).toHaveURL('/chats');
  });

  test('sends a signed-in visitor away from the login page', async ({ student }) => {
    await student.page.goto('/login');
    await expect(student.page).toHaveURL('/chats');
  });

  test('a forged session hint buys a login page, not an application', async ({ page }) => {
    // `proxy.ts` reads presence only, so this is enough to get past it — which
    // is the point: the layout then asks the API who this is, the API checks a
    // signature it never issued, and the visitor lands back on /login.
    await page
      .context()
      .addCookies([{ name: COOKIE_NAMES.sessionHint, value: '1', url: 'http://localhost' }]);

    await page.goto('/chats');
    await expect(page).toHaveURL('/login');
  });

  test('an emptied cookie jar ends the session at the next navigation', async ({ student }) => {
    await student.page.goto('/chats');
    await expect(student.page.getByRole('heading', { name: 'گفت‌وگوها' })).toBeVisible();

    await student.context.clearCookies();

    await student.page.goto('/chats');
    await expect(student.page).toHaveURL(/\/login/);
  });
});

test.describe('registering', () => {
  /** `09` and nine digits, unique enough for one run of one spec. */
  const freshPhoneNumber = () => `09${Date.now().toString().slice(-9)}`;

  test('creates a student account and signs them straight in', async ({ page }) => {
    const universityId = `40${Date.now().toString(36)}`;

    await page.goto('/register');
    await page.getByLabel('نام و نام خانوادگی').fill('دانشجوی تازه‌وارد');
    await page.getByLabel('شناسهٔ دانشگاهی').fill(universityId);
    await page.getByLabel('شمارهٔ تلفن همراه').fill(freshPhoneNumber());
    await page.getByLabel('گذرواژه').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'ساخت حساب کاربری' }).click();

    await expect(page).toHaveURL('/chats');

    // The form has no role selector and `registerSchema` has no role field.
    // This is the assertion that says so about the row that was actually
    // written, rather than about the form that wrote it.
    const role = await withDb(async (client) => {
      const { rows } = await client.query<{ role: string }>(
        'SELECT role FROM users WHERE university_id = $1',
        [universityId]
      );
      return rows[0]?.role;
    });
    expect(role).toBe('STUDENT');
  });

  test('reports a taken university ID under the field that caused it', async ({ page }) => {
    const existing = await createAccount('STUDENT');

    await page.goto('/register');
    await page.getByLabel('نام و نام خانوادگی').fill('همنام تکراری');
    await page.getByLabel('شناسهٔ دانشگاهی').fill(existing.universityId);
    await page.getByLabel('شمارهٔ تلفن همراه').fill(freshPhoneNumber());
    await page.getByLabel('گذرواژه').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'ساخت حساب کاربری' }).click();

    await expect(page.getByText('این شناسهٔ دانشگاهی قبلاً ثبت شده است.')).toBeVisible();
    await expect(page).toHaveURL('/register');
  });

  test('names the phone number when that is the half that collided', async ({ page }) => {
    // Both columns are unique and one query checks both, so the message has to
    // come from the row that came back. Telling someone their student number is
    // taken when it is their phone number sends them to fix the wrong field.
    const existing = await createAccount('STUDENT');

    await page.goto('/register');
    await page.getByLabel('نام و نام خانوادگی').fill('شمارهٔ تکراری');
    await page.getByLabel('شناسهٔ دانشگاهی').fill(`40${Date.now().toString(36)}`);
    await page.getByLabel('شمارهٔ تلفن همراه').fill(existing.phoneNumber);
    await page.getByLabel('گذرواژه').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'ساخت حساب کاربری' }).click();

    await expect(page.getByText('این شمارهٔ تلفن قبلاً ثبت شده است.')).toBeVisible();
    await expect(page).toHaveURL('/register');
  });
});

test.describe('signing out', () => {
  test('clears the session and returns to the login page', async ({ student }) => {
    await student.page.goto('/chats');

    await student.page.getByRole('button', { name: 'حساب کاربری' }).click();
    await student.page.getByRole('menuitem', { name: 'خروج از حساب' }).click();

    await expect(student.page).toHaveURL(/\/login/);

    const names = (await student.context.cookies()).map((cookie) => cookie.name);
    expect(names).not.toContain(COOKIE_NAMES.access);
    expect(names).not.toContain(COOKIE_NAMES.sessionHint);

    // And the door stays shut: going back is not a way back in.
    await student.page.goto('/chats');
    await expect(student.page).toHaveURL(/\/login/);
  });
});
