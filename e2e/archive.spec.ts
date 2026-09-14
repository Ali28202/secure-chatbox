import { API_URL } from './support/env';
import { expect, test } from './support/fixtures';

test.describe('archiving a group', () => {
  test('takes it out of the list, closes it to everyone, and comes back', async ({
    professor,
    newSession,
  }) => {
    const attendee = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'ترم گذشته', [
      attendee.account.id,
    ]);

    await professor.page.goto(`/chats/${chat.id}`);
    await professor.page.getByRole('button', { name: 'تنظیمات گفت‌وگو' }).click();
    await professor.page.getByRole('menuitem', { name: 'آرشیو کردن' }).click();

    // Closed to the admin who archived it too — archiving says the conversation
    // is over, which read-only does not.
    await expect(professor.page.getByLabel('متن پیام')).toBeHidden();
    await expect(
      professor.page.getByText('این گفت‌وگو آرشیو شده.', { exact: false })
    ).toBeVisible();

    const refused = await attendee.api
      .raw()
      .post(`${API_URL}/api/chats/${chat.id}/messages`, { data: { content: 'هنوز اینجام' } });
    expect(refused.status()).toBe(403);

    await attendee.page.goto('/chats');
    await expect(attendee.page.getByText('ترم گذشته')).toBeHidden();

    await attendee.page.getByRole('tab', { name: 'آرشیو' }).click();
    await expect(attendee.page.getByText('ترم گذشته')).toBeVisible();

    await professor.page.getByRole('button', { name: 'تنظیمات گفت‌وگو' }).click();
    await professor.page.getByRole('menuitem', { name: 'خروج از آرشیو' }).click();
    await expect(professor.page.getByLabel('متن پیام')).toBeVisible();
  });

  test('is not something an admin who did not make the group may do', async ({
    student,
    newSession,
  }) => {
    const deputy = await newSession('STUDENT');
    const chat = await student.api.createGroup('CUSTOM_GROUP', 'گروه درسی من', [deputy.account.id]);

    await student.api.updateMember(chat.id, deputy.account.id, { role: 'ADMIN' });

    const refused = await deputy.api
      .raw()
      .patch(`${API_URL}/api/chats/${chat.id}`, { data: { isArchived: true } });
    expect(refused.status()).toBe(403);

    // …but renaming it, which only affects the label, still is.
    const renamed = await deputy.api
      .raw()
      .patch(`${API_URL}/api/chats/${chat.id}`, { data: { title: 'نام تازه' } });
    expect(renamed.status()).toBe(200);
  });

  test('keeps every message rather than deleting them', async ({ professor, newSession }) => {
    const attendee = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'بایگانی', [attendee.account.id]);
    await professor.api.sendMessage(chat.id, 'این باید بماند');

    await professor.api.updateChat(chat.id, { isArchived: true });

    await attendee.page.goto(`/chats/${chat.id}`);
    await expect(attendee.page.getByText('این باید بماند')).toBeVisible();
  });
});
