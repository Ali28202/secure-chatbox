import { createAccount } from './support/db';
import { expect, test } from './support/fixtures';

test.describe('starting a direct conversation', () => {
  test('finds someone by university ID and opens a conversation with them', async ({ student }) => {
    const peer = await createAccount('PROFESSOR', { name: 'دکتر مجید آقایی' });

    await student.page.goto('/chats');
    await student.page.getByRole('button', { name: 'گفت‌وگوی جدید' }).click();

    const dialog = student.page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('جست‌وجوی کاربرها').fill(peer.universityId);
    await dialog.getByRole('button', { name: peer.name }).click();

    await expect(student.page).toHaveURL(/\/chats\/[0-9a-f-]{36}$/);
    await expect(student.page.getByRole('heading', { name: peer.name })).toBeVisible();
  });

  test('says so plainly when a search matches nobody', async ({ student }) => {
    await student.page.goto('/chats');
    await student.page.getByRole('button', { name: 'گفت‌وگوی جدید' }).click();

    const dialog = student.page.getByRole('dialog');
    await dialog.getByLabel('جست‌وجوی کاربرها').fill('کسی‌که‌وجود‌ندارد');

    await expect(dialog.getByText('کسی با این مشخصات پیدا نشد.')).toBeVisible();
  });

  test('never lets the same pair end up with two conversations', async ({ student }) => {
    const peer = await createAccount('STUDENT');

    const first = await student.api.createDirectChat(peer.id);
    const second = await student.api.createDirectChat(peer.id);

    expect(second.id).toBe(first.id);

    const chats = await student.api.listChats();
    expect(chats.filter((chat) => chat.type === 'DIRECT')).toHaveLength(1);
  });

  test('shows an empty list to someone with no conversations yet', async ({ student }) => {
    await student.page.goto('/chats');
    await expect(student.page.getByText('هنوز گفت‌وگویی نداری')).toBeVisible();
  });
});

test.describe('creating a group', () => {
  test('a professor names a group and gathers its members', async ({ professor }) => {
    const attendee = await createAccount('STUDENT', { name: 'زهرا کریمی' });

    await professor.page.goto('/chats');
    await professor.page.getByRole('button', { name: 'گفت‌وگوی جدید' }).click();

    const dialog = professor.page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'گروه' }).click();
    await dialog.getByLabel('اسم گروه').fill('مهندسی نرم‌افزار — گروه ۱');

    await dialog.getByLabel('جست‌وجوی کاربرها').fill(attendee.universityId);
    await dialog.getByRole('button', { name: attendee.name }).click();

    await dialog.getByRole('button', { name: 'ساخت گروه' }).click();

    await expect(professor.page).toHaveURL(/\/chats\/[0-9a-f-]{36}$/);
    await expect(
      professor.page.getByRole('heading', { name: 'مهندسی نرم‌افزار — گروه ۱' })
    ).toBeVisible();

    await expect(professor.page.getByRole('button', { name: '۲ عضو' })).toBeVisible();
  });

  test('refuses a group with no name, without asking the server', async ({ professor }) => {
    await professor.page.goto('/chats');
    await professor.page.getByRole('button', { name: 'گفت‌وگوی جدید' }).click();

    const dialog = professor.page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'گروه' }).click();
    await dialog.getByRole('button', { name: 'ساخت گروه' }).click();

    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(professor.page).toHaveURL('/chats');
  });

  test('puts a new group in the list of everyone added to it', async ({
    professor,
    newSession,
  }) => {
    const attendee = await newSession('STUDENT');

    await professor.api.createGroup('ساختمان داده‌ها', [attendee.account.id]);

    await attendee.page.goto('/chats');
    await expect(attendee.page.getByRole('link', { name: /ساختمان داده‌ها/ })).toBeVisible();
  });
});

test.describe('membership', () => {
  test('a member added later can read what was said before they arrived', async ({
    professor,
    newSession,
  }) => {
    const latecomer = await newSession('STUDENT');
    const chat = await professor.api.createGroup('مبانی برنامه‌نویسی');
    await professor.api.sendMessage(chat.id, 'جلسهٔ اول: فردا ساعت ۱۰');

    await professor.api.addMember(chat.id, latecomer.account.id);

    await latecomer.page.goto(`/chats/${chat.id}`);
    await expect(latecomer.page.getByText('جلسهٔ اول: فردا ساعت ۱۰')).toBeVisible();
  });

  test('an admin can mute a member, and the member is told why', async ({
    professor,
    newSession,
  }) => {
    const muted = await newSession('STUDENT');
    const chat = await professor.api.createGroup('گروه پرسش و پاسخ', [muted.account.id]);

    await professor.api.updateMember(chat.id, muted.account.id, { isMuted: true });

    await muted.page.goto(`/chats/${chat.id}`);

    await expect(muted.page.getByLabel('متن پیام')).toBeHidden();
    await expect(
      muted.page.getByText('تو این گفت‌وگو بی‌صدا شدی و نمی‌تونی پیام بدی.')
    ).toBeVisible();
  });
});
