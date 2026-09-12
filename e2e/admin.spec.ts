import { createAccount } from './support/db';
import { API_URL } from './support/env';
import { expect, test } from './support/fixtures';

test.describe('the admin panel', () => {
  test('is closed to students and to professors', async ({ student, professor }) => {
    expect((await student.api.raw().get(`${API_URL}/api/admin/users`)).status()).toBe(403);

    // A professor runs course groups; that is not the same as running the
    // deployment, so the panel is not theirs either.
    expect((await professor.api.raw().get(`${API_URL}/api/admin/users`)).status()).toBe(403);

    await student.page.goto('/admin');
    await expect(student.page).toHaveURL('/chats');
  });

  test('approves a pending account, which can then sign in', async ({ newSession, page }) => {
    const admin = await newSession('ADMIN');
    const pending = await createAccount('STUDENT', { status: 'PENDING' });

    await admin.page.goto('/admin');
    await expect(admin.page.getByText(pending.name)).toBeVisible();

    await admin.page
      .getByRole('listitem')
      .filter({ hasText: pending.name })
      .getByRole('button', { name: 'تأیید' })
      .click();

    await expect(admin.page.getByText(`${pending.name} تأیید شد.`)).toBeVisible();

    await page.goto('/login');
    await page.getByLabel('شماره دانشجویی یا شمارهٔ تلفن').fill(pending.universityId);
    await page.getByLabel('گذرواژه').fill(pending.password);
    await page.getByRole('button', { name: 'ورود به سامانه' }).click();

    await expect(page).toHaveURL('/chats');
  });

  test('rejecting someone ends the session they already had', async ({ newSession }) => {
    const admin = await newSession('ADMIN');
    const victim = await newSession('STUDENT');

    expect((await victim.api.raw().get(`${API_URL}/api/auth/me`)).status()).toBe(200);

    const rejected = await admin.api
      .raw()
      .patch(`${API_URL}/api/admin/users/${victim.account.id}`, {
        data: { status: 'REJECTED' },
      });
    expect(rejected.status()).toBe(200);

    // 401, not 403: their session row was revoked, so they are simply not
    // signed in any more. A decision that only took effect at token expiry
    // would not be a decision.
    expect((await victim.api.raw().get(`${API_URL}/api/auth/me`)).status()).toBe(401);

    // The reason is what they meet when they try to get back in.
    const retry = await victim.api.raw().post(`${API_URL}/api/auth/login`, {
      data: {
        identifier: victim.account.universityId,
        password: victim.account.password,
        deviceId: `e2e-${victim.account.universityId}-retry`,
      },
    });
    expect(retry.status()).toBe(403);
    expect((await retry.json()).error?.message).toContain('پذیرفته نشده');
  });

  test('changes a role, and the new role is what the API enforces', async ({ newSession }) => {
    const admin = await newSession('ADMIN');
    const student = await newSession('STUDENT');

    // A student may not create a course group…
    const before = await student.api
      .raw()
      .post(`${API_URL}/api/chats`, { data: { type: 'COURSE_GROUP', title: 'قبل از ارتقا' } });
    expect(before.status()).toBe(403);

    await admin.api.raw().patch(`${API_URL}/api/admin/users/${student.account.id}`, {
      data: { role: 'PROFESSOR' },
    });

    // …and once promoted, may.
    const after = await student.api
      .raw()
      .post(`${API_URL}/api/chats`, { data: { type: 'COURSE_GROUP', title: 'بعد از ارتقا' } });
    expect(after.status()).toBe(201);
  });

  test('refuses to let an admin act on their own account', async ({ newSession }) => {
    const admin = await newSession('ADMIN');

    // Otherwise the last administrator could demote themselves and leave the
    // deployment with nobody able to put it right.
    const response = await admin.api.raw().patch(`${API_URL}/api/admin/users/${admin.account.id}`, {
      data: { role: 'STUDENT' },
    });
    expect(response.status()).toBe(403);
  });
});
