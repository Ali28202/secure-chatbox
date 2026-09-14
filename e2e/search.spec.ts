import { API_URL } from './support/env';
import { expect, test } from './support/fixtures';

test.describe('searching messages', () => {
  test('finds a message in another conversation and links to it', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createGroup('گروه ترم', [peer.account.id]);
    await peer.api.sendMessage(chat.id, 'جلسهٔ جبران فردا ساعت ده برگزار می‌شود');

    await student.page.goto('/chats');
    await student.page.getByRole('button', { name: 'جست‌وجوی پیام‌ها' }).click();

    const dialog = student.page.getByRole('dialog');
    await dialog.getByLabel('عبارت جست‌وجو').fill('جبران');

    await expect(dialog.getByText('جلسهٔ جبران فردا', { exact: false })).toBeVisible();
    await dialog.getByText('جلسهٔ جبران فردا', { exact: false }).click();

    await expect(student.page).toHaveURL(`/chats/${chat.id}`);
  });

  test('matches inside a word, which a stemmer would not', async ({ student, newSession }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);
    await peer.api.sendMessage(chat.id, 'کتاب‌های درسی رسیدند');

    const { hits } = await student.api.search('کتاب');

    expect(hits).toHaveLength(1);
    expect(hits[0]?.message.content).toContain('کتاب‌های درسی');
    expect(hits[0]?.chatId).toBe(chat.id);
  });

  test('never reaches a conversation you are not in', async ({ professor, newSession }) => {
    const outsider = await newSession('STUDENT');
    const chat = await professor.api.createGroup('شورای گروه');
    await professor.api.sendMessage(chat.id, 'یک راز کاملاً یکتا برای جست‌وجو');

    const { hits } = await outsider.api.search('یکتا برای جست‌وجو');
    expect(hits).toHaveLength(0);

    const own = await professor.api.search('یکتا برای جست‌وجو');
    expect(own.hits).toHaveLength(1);
  });

  test('does not return deleted messages', async ({ student, newSession }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);
    const message = await student.api.sendMessage(chat.id, 'عبارت یکتای حذف‌شدنی');

    await student.api.raw().delete(`${API_URL}/api/chats/${chat.id}/messages/${message.id}`, {
      data: {},
    });

    const { hits } = await student.api.search('حذف‌شدنی');
    expect(hits).toHaveLength(0);
  });

  test('refuses a query too short to index', async ({ student }) => {
    const response = await student.api.raw().get(`${API_URL}/api/search?q=ک`);
    expect(response.status()).toBe(422);
  });
});
