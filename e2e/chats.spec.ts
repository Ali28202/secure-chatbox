import { createAccount } from './support/db';
import { expect, test } from './support/fixtures';

/**
 * Starting conversations, and who ends up in them.
 *
 * The dedup case is the one with teeth. Two people can only have one direct
 * chat, and the rule is enforced by a lookup on the sorted member pair rather
 * than a unique constraint — which means it is code, and code that is only
 * exercised on the second attempt. Nobody hits that path by hand twice.
 */

test.describe('starting a direct conversation', () => {
  test('finds someone by university ID and opens a conversation with them', async ({ student }) => {
    const peer = await createAccount('PROFESSOR', { name: 'دکتر مجید آقایی' });

    await student.page.goto('/chats');
    await student.page.getByRole('button', { name: 'گفت‌وگوی جدید' }).click();

    const dialog = student.page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // By university ID rather than name: the directory holds every account in
    // the database, including the ones other tests in this run are creating, and
    // the ID is the only field guaranteed to name exactly one person.
    await dialog.getByLabel('جست‌وجوی کاربران').fill(peer.universityId);
    await dialog.getByRole('button', { name: peer.name }).click();

    await expect(student.page).toHaveURL(/\/chats\/[0-9a-f-]{36}$/);
    await expect(student.page.getByRole('heading', { name: peer.name })).toBeVisible();
  });

  test('says so plainly when a search matches nobody', async ({ student }) => {
    await student.page.goto('/chats');
    await student.page.getByRole('button', { name: 'گفت‌وگوی جدید' }).click();

    const dialog = student.page.getByRole('dialog');
    await dialog.getByLabel('جست‌وجوی کاربران').fill('کسی‌که‌وجود‌ندارد');

    await expect(dialog.getByText('کسی با این مشخصات پیدا نشد.')).toBeVisible();
  });

  test('never lets the same pair end up with two conversations', async ({ student }) => {
    const peer = await createAccount('STUDENT');

    const first = await student.api.createDirectChat(peer.id);
    const second = await student.api.createDirectChat(peer.id);

    // The second request returns the first chat rather than a new one, so the
    // pair keep one thread however many times either of them starts it.
    expect(second.id).toBe(first.id);

    const chats = await student.api.listChats();
    expect(chats.filter((chat) => chat.type === 'DIRECT')).toHaveLength(1);
  });

  test('shows an empty list to someone with no conversations yet', async ({ student }) => {
    await student.page.goto('/chats');
    await expect(student.page.getByText('هنوز گفت‌وگویی ندارید')).toBeVisible();
  });
});

test.describe('creating a group', () => {
  test('a professor names a course group and gathers its members', async ({ professor }) => {
    const attendee = await createAccount('STUDENT', { name: 'زهرا کریمی' });

    await professor.page.goto('/chats');
    await professor.page.getByRole('button', { name: 'گفت‌وگوی جدید' }).click();

    const dialog = professor.page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'گروه' }).click();
    await dialog.getByLabel('نام گروه').fill('مهندسی نرم‌افزار — گروه ۱');

    // Offered to a professor and to nobody else, so its presence is part of what
    // this test is asserting. `access-control.spec.ts` covers the other half.
    await dialog.getByRole('button', { name: 'گروه درسی' }).click();

    await dialog.getByLabel('جست‌وجوی کاربران').fill(attendee.universityId);
    await dialog.getByRole('button', { name: attendee.name }).click();

    await dialog.getByRole('button', { name: 'ساخت گروه' }).click();

    await expect(professor.page).toHaveURL(/\/chats\/[0-9a-f-]{36}$/);
    await expect(
      professor.page.getByRole('heading', { name: 'مهندسی نرم‌افزار — گروه ۱' })
    ).toBeVisible();

    // Persian digits, because the whole interface counts in them. Two: the
    // professor who made it and the student they picked.
    await expect(professor.page.getByRole('button', { name: '۲ عضو' })).toBeVisible();
  });

  test('refuses a group with no name, without asking the server', async ({ professor }) => {
    await professor.page.goto('/chats');
    await professor.page.getByRole('button', { name: 'گفت‌وگوی جدید' }).click();

    const dialog = professor.page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'گروه' }).click();
    await dialog.getByRole('button', { name: 'ساخت گروه' }).click();

    // The same schema the API parses runs here first, so the message is the
    // API's own rather than a second copy written for the form.
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(professor.page).toHaveURL('/chats');
  });

  test('puts a new group in the list of everyone added to it', async ({
    professor,
    newSession,
  }) => {
    const attendee = await newSession('STUDENT');

    await professor.api.createGroup('COURSE_GROUP', 'ساختمان داده‌ها', [attendee.account.id]);

    // The student never asked for this chat and never accepted it. Being added
    // by a professor is the whole enrolment mechanism, so it has to show up
    // unprompted on their side.
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
    const chat = await professor.api.createGroup('COURSE_GROUP', 'مبانی برنامه‌نویسی');
    await professor.api.sendMessage(chat.id, 'جلسهٔ اول: فردا ساعت ۱۰');

    await professor.api.addMember(chat.id, latecomer.account.id);

    // A course group's history is course material. Hiding what was said before
    // enrolment would mean a student added in week three starts from nothing.
    await latecomer.page.goto(`/chats/${chat.id}`);
    await expect(latecomer.page.getByText('جلسهٔ اول: فردا ساعت ۱۰')).toBeVisible();
  });

  test('an admin can mute a member, and the member is told why', async ({
    professor,
    newSession,
  }) => {
    const muted = await newSession('STUDENT');
    const chat = await professor.api.createGroup('CUSTOM_GROUP', 'گروه پرسش و پاسخ', [
      muted.account.id,
    ]);

    await professor.api.updateMember(chat.id, muted.account.id, { isMuted: true });

    await muted.page.goto(`/chats/${chat.id}`);

    // The composer is replaced by the reason, not greyed out: a box that will
    // not accept typing and does not say why reads as a broken page.
    await expect(muted.page.getByLabel('متن پیام')).toBeHidden();
    await expect(
      muted.page.getByText('شما در این گفت‌وگو بی‌صدا شده‌اید و نمی‌توانید پیام بفرستید.')
    ).toBeVisible();
  });
});
