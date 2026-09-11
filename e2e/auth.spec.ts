import { COOKIE_NAMES } from '@repo/shared';
import { createAccount, withDb } from './support/db';
import { E2E_PASSWORD } from './support/env';
import { expect, test } from './support/fixtures';
import type { Page } from '@playwright/test';

function formAlert(page: Page) {
  return page.locator('form').getByRole('alert');
}

test.describe('signing in', () => {
  test('takes a student from the form to their conversations', async ({ page }) => {
    const account = await createAccount('STUDENT');

    await page.goto('/login');
    await page.getByLabel('شماره دانشجویی یا شمارهٔ تلفن').fill(account.universityId);
    await page.getByLabel('گذرواژه').fill(account.password);
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();

    await expect(page).toHaveURL('/chats');
    await expect(page.getByRole('heading', { name: 'گفت‌وگوها' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'حساب کاربری' })).toBeVisible();
  });

  test('leaves the session cookies httpOnly, and the refresh cookie scoped', async ({ page }) => {
    const account = await createAccount('STUDENT');

    await page.goto('/login');
    await page.getByLabel('شماره دانشجویی یا شمارهٔ تلفن').fill(account.universityId);
    await page.getByLabel('گذرواژه').fill(account.password);
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();
    await expect(page).toHaveURL('/chats');

    const cookies = await page.context().cookies();
    const byName = new Map(cookies.map((cookie) => [cookie.name, cookie]));

    expect(byName.get(COOKIE_NAMES.access)?.httpOnly).toBe(true);
    expect(byName.get(COOKIE_NAMES.refresh)?.httpOnly).toBe(true);
    expect(byName.get(COOKIE_NAMES.sessionHint)).toBeDefined();

    expect(byName.get(COOKIE_NAMES.refresh)?.path).toBe('/api/auth');
    expect(byName.get(COOKIE_NAMES.access)?.path).toBe('/');

    expect(byName.get(COOKIE_NAMES.access)?.secure).toBe(false);
  });

  test('accepts a phone number in the same field as a student number', async ({ page }) => {
    const account = await createAccount('STUDENT');

    await page.goto('/login');
    await page.getByLabel('شماره دانشجویی یا شمارهٔ تلفن').fill(account.phoneNumber);
    await page.getByLabel('گذرواژه').fill(account.password);
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();

    await expect(page).toHaveURL('/chats');
  });

  test('accepts a phone number typed in Persian digits', async ({ page }) => {
    const account = await createAccount('STUDENT');
    const persian = account.phoneNumber.replace(/\d/g, (digit) =>
      String.fromCharCode(0x06f0 + Number(digit))
    );

    await page.goto('/login');
    await page.getByLabel('شماره دانشجویی یا شمارهٔ تلفن').fill(persian);
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
    await page.getByLabel('شماره دانشجویی یا شمارهٔ تلفن').fill(account.universityId);
    await page.getByLabel('گذرواژه').fill('WrongPassword@1404');
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();

    await expect(formAlert(page)).toContainText('شناسه یا گذرواژه نادرست است.');
    await expect(page).toHaveURL('/login');
  });

  test('says the same thing about an account that does not exist', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('شماره دانشجویی یا شمارهٔ تلفن').fill('400000000');
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

    await page.getByLabel('شماره دانشجویی یا شمارهٔ تلفن').fill(account.universityId);
    await page.getByLabel('گذرواژه').fill(account.password);
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();

    await expect(page).toHaveURL('/chats');
  });

  test('does not follow ?next= off the site', async ({ page }) => {
    const account = await createAccount('STUDENT');

    await page.goto('/login?next=https%3A%2F%2Fevil.example%2Fsteal');
    await page.getByLabel('شماره دانشجویی یا شمارهٔ تلفن').fill(account.universityId);
    await page.getByLabel('گذرواژه').fill(account.password);
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();

    await expect(page).toHaveURL('/chats');
  });

  test('sends a signed-in visitor away from the login page', async ({ student }) => {
    await student.page.goto('/login');
    await expect(student.page).toHaveURL('/chats');
  });

  test('a forged session hint buys a login page, not an application', async ({ page }) => {
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
  const freshPhoneNumber = () => `09${Date.now().toString().slice(-9)}`;

  test('creates a student account and signs them straight in', async ({ page }) => {
    const universityId = `40${Date.now().toString(36)}`;

    await page.goto('/register');
    await page.getByLabel('نام و نام خانوادگی').fill('دانشجوی تازه‌وارد');
    await page.getByLabel('شماره دانشجویی').fill(universityId);
    await page.getByLabel('شمارهٔ تلفن همراه').fill(freshPhoneNumber());
    await page.getByLabel('گذرواژه').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'ساخت حساب کاربری' }).click();

    await expect(page).toHaveURL('/chats');

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
    await page.getByLabel('شماره دانشجویی').fill(existing.universityId);
    await page.getByLabel('شمارهٔ تلفن همراه').fill(freshPhoneNumber());
    await page.getByLabel('گذرواژه').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'ساخت حساب کاربری' }).click();

    await expect(page.getByText('این شماره دانشجویی قبلاً ثبت شده است.')).toBeVisible();
    await expect(page).toHaveURL('/register');
  });

  test('names the phone number when that is the half that collided', async ({ page }) => {
    const existing = await createAccount('STUDENT');

    await page.goto('/register');
    await page.getByLabel('نام و نام خانوادگی').fill('شمارهٔ تکراری');
    await page.getByLabel('شماره دانشجویی').fill(`40${Date.now().toString(36)}`);
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

    await student.page.goto('/chats');
    await expect(student.page).toHaveURL(/\/login/);
  });
});
