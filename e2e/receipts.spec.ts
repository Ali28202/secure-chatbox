import { getReceiptStatus } from './support/db';
import { expect, test } from './support/fixtures';

test.describe('unread counts', () => {
  test('raises a badge on the list, and clears it when the chat is opened', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('PROFESSOR');
    const chat = await student.api.createDirectChat(peer.account.id);
    const unread = await peer.api.sendMessage(chat.id, 'پیام خوانده‌نشده');

    await student.page.goto('/chats');

    const row = student.page.getByRole('link', { name: new RegExp(peer.account.name) });
    await expect(row.getByText('۱', { exact: true })).toBeVisible();

    await row.click();
    await expect(student.page.getByText('پیام خوانده‌نشده')).toBeVisible();

    await expect
      .poll(() => getReceiptStatus(unread.id, student.account.id), {
        message: 'expected the read to be reported before leaving the conversation',
      })
      .toBe('READ');

    await student.page.getByRole('button', { name: 'بازگشت' }).click();
    await expect(student.page.getByRole('heading', { name: 'گفت‌وگوها' })).toBeVisible();

    await expect(
      student.page.getByRole('link', { name: new RegExp(peer.account.name) }).getByText('۱', {
        exact: true,
      })
    ).toBeHidden();
  });

  test('counts up as more arrive while the list is open', async ({ student, newSession }) => {
    const peer = await newSession('PROFESSOR');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto('/chats');

    const row = student.page.getByRole('link', { name: new RegExp(peer.account.name) });
    await expect(row).toBeVisible();

    await peer.api.sendMessage(chat.id, 'یک');
    await peer.api.sendMessage(chat.id, 'دو');
    await peer.api.sendMessage(chat.id, 'سه');

    await expect(row.getByText('۳', { exact: true })).toBeVisible();
  });

  test('does not count your own messages against you', async ({ student, newSession }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);
    await student.api.sendMessage(chat.id, 'پیام خودم');

    await student.page.goto('/chats');
    await expect(student.page.getByText('پیام خودم')).toBeVisible();

    const row = student.page.getByRole('link', { name: new RegExp(peer.account.name) });
    await expect(row.getByText('۱', { exact: true })).toBeHidden();
  });
});

test.describe('read ticks', () => {
  test('turns from sent to read when the other person opens the conversation', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);
    await student.page.getByLabel('متن پیام').fill('رسید؟');
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();

    await expect(student.page.getByRole('img', { name: 'ارسال شد' })).toBeVisible();

    await peer.page.goto(`/chats/${chat.id}`);

    await expect(student.page.getByRole('img', { name: 'خوانده شد' })).toBeVisible();
  });

  test('says how many of a group have read it while some have not', async ({
    professor,
    newSession,
  }) => {
    const present = await newSession('STUDENT');
    const absent = await newSession('STUDENT');

    const chat = await professor.api.createGroup('COURSE_GROUP', 'هوش مصنوعی', [
      present.account.id,
      absent.account.id,
    ]);

    const message = await professor.api.sendMessage(chat.id, 'تمرین سری دوم بارگذاری شد.');

    await professor.page.goto(`/chats/${chat.id}`);
    await expect(professor.page.getByRole('img', { name: 'ارسال شد' })).toBeVisible();

    await present.page.goto(`/chats/${chat.id}`);

    await expect(
      professor.page.getByRole('img', { name: 'خوانده‌شده توسط ۱ نفر از ۲ نفر' })
    ).toBeVisible();

    expect(await getReceiptStatus(message.id, absent.account.id)).not.toBe('READ');
  });

  test('records the receipt against the reader, not the sender', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);
    const message = await student.api.sendMessage(chat.id, 'برای ثبت رسید');

    await peer.page.goto(`/chats/${chat.id}`);
    await expect(peer.page.getByText('برای ثبت رسید')).toBeVisible();

    await expect
      .poll(() => getReceiptStatus(message.id, peer.account.id), {
        message: 'expected the reader to have a READ receipt',
      })
      .toBe('READ');

    expect(await getReceiptStatus(message.id, student.account.id)).toBeNull();
  });
});
