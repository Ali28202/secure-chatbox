import { createAccount, getMembership } from './support/db';
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

  test('offers a way back to the conversations, and the role menu opens', async ({
    newSession,
  }) => {
    const admin = await newSession('ADMIN');
    const other = await createAccount('STUDENT', { status: 'APPROVED' });

    await admin.page.goto('/admin');

    // The shield menu used to crash: a Base UI label outside a group throws.
    await admin.page.getByRole('tab', { name: 'تأییدشده' }).click();
    await admin.page.getByRole('button', { name: `مدیریت حساب ${other.name}` }).click();
    await expect(admin.page.getByRole('menuitem', { name: 'استاد' })).toBeVisible();
    await admin.page.keyboard.press('Escape');

    // `Button render={<Link/>}` is an anchor that keeps `role="button"`.
    await admin.page.getByRole('button', { name: 'برگرد به گفت‌وگوها' }).click();
    await expect(admin.page).toHaveURL('/chats');
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

test.describe('a system administrator inside a conversation', () => {
  test('can moderate a group they were never added to', async ({ professor, newSession }) => {
    const admin = await newSession('ADMIN');
    const attendee = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'گروه بدون ادمین', [
      attendee.account.id,
    ]);
    const message = await attendee.api.sendMessage(chat.id, 'پیامی که باید برداشته شود');

    // No membership row exists for them at all.
    expect(await getMembership(chat.id, admin.account.id)).toBeNull();

    expect((await admin.api.raw().get(`${API_URL}/api/chats/${chat.id}`)).status()).toBe(200);

    const pinned = await admin.api.setPinned(chat.id, message.id, true);
    expect(pinned.isPinned).toBe(true);

    const removed = await admin.api
      .raw()
      .delete(`${API_URL}/api/chats/${chat.id}/messages/${message.id}`, { data: {} });
    expect(removed.status()).toBe(200);
  });

  test('may change the roster and demote the creator, which a chat admin may not', async ({
    student,
    newSession,
  }) => {
    const admin = await newSession('ADMIN');
    const latecomer = await newSession('STUDENT');
    const chat = await student.api.createGroup('CUSTOM_GROUP', 'گروه دانشجو');

    // The creator's seat is protected from the chat's own admins…
    const deputy = await newSession('STUDENT');
    await student.api.addMember(chat.id, deputy.account.id);
    await student.api.updateMember(chat.id, deputy.account.id, { role: 'ADMIN' });

    const byPeer = await deputy.api
      .raw()
      .patch(`${API_URL}/api/chats/${chat.id}/members/${student.account.id}`, {
        data: { role: 'MEMBER' },
      });
    expect(byPeer.status()).toBe(403);

    // …but not from the platform's operator, or a broken group could not be fixed.
    await admin.api.addMember(chat.id, latecomer.account.id);

    const byAdmin = await admin.api
      .raw()
      .patch(`${API_URL}/api/chats/${chat.id}/members/${student.account.id}`, {
        data: { role: 'MEMBER' },
      });
    expect(byAdmin.status()).toBe(200);
  });

  test('can write into a group that is read-only for everyone else', async ({
    professor,
    newSession,
  }) => {
    const admin = await newSession('ADMIN');
    const attendee = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'گروه بسته', [
      attendee.account.id,
    ]);

    await professor.api.updateChat(chat.id, { isReadOnly: true });

    const refused = await attendee.api
      .raw()
      .post(`${API_URL}/api/chats/${chat.id}/messages`, { data: { content: 'نباید برود' } });
    expect(refused.status()).toBe(403);

    const sent = await admin.api.sendMessage(chat.id, 'اعلان مدیر سامانه');
    expect(sent.content).toBe('اعلان مدیر سامانه');
  });

  test('stays out of other people’s direct conversations', async ({ student, newSession }) => {
    const admin = await newSession('ADMIN');
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    // Running a university's groups is not the same as reading its private mail.
    expect((await admin.api.raw().get(`${API_URL}/api/chats/${chat.id}`)).status()).toBe(404);
  });

  test('cannot post into an archived group either — that is a state, not a permission', async ({
    professor,
    newSession,
  }) => {
    const admin = await newSession('ADMIN');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'گروه آرشیوی');

    await professor.api.updateChat(chat.id, { isArchived: true });

    const refused = await admin.api
      .raw()
      .post(`${API_URL}/api/chats/${chat.id}/messages`, { data: { content: 'سلام' } });
    expect(refused.status()).toBe(403);
  });
});

test.describe('a disabled account', () => {
  test('is refused at login and loses the session it had', async ({ newSession }) => {
    const admin = await newSession('ADMIN');
    const victim = await newSession('STUDENT');

    expect((await victim.api.raw().get(`${API_URL}/api/auth/me`)).status()).toBe(200);

    await admin.api.raw().patch(`${API_URL}/api/admin/users/${victim.account.id}`, {
      data: { isActive: false },
    });

    expect((await victim.api.raw().get(`${API_URL}/api/auth/me`)).status()).toBe(401);

    const retry = await victim.api.raw().post(`${API_URL}/api/auth/login`, {
      data: {
        identifier: victim.account.universityId,
        password: victim.account.password,
        deviceId: `e2e-${victim.account.universityId}-again`,
      },
    });
    expect(retry.status()).toBe(403);
    expect((await retry.json()).error?.message).toContain('غیرفعال');
  });
});
