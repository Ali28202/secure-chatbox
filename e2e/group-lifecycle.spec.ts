import { getMembership } from './support/db';
import { API_URL } from './support/env';
import { expect, test } from './support/fixtures';

test.describe('deleting a group', () => {
  test('hides it from everyone without destroying anything', async ({ professor, newSession }) => {
    const attendee = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'درس تمام‌شده', [
      attendee.account.id,
    ]);
    await professor.api.sendMessage(chat.id, 'این پیام باید در دیتابیس بماند');

    const deleted = await professor.api.raw().delete(`${API_URL}/api/chats/${chat.id}`, {
      data: {},
    });
    expect(deleted.status()).toBe(200);

    // Gone from every read path, for the member as well as the one who deleted it.
    expect((await attendee.api.raw().get(`${API_URL}/api/chats/${chat.id}`)).status()).toBe(404);
    expect(await attendee.api.listChats()).toHaveLength(0);

    // …and from the archive view too: deleted is not archived.
    const archived = await attendee.api
      .raw()
      .get(`${API_URL}/api/chats`, { params: { archived: 'true' } });
    expect(await archived.json()).toHaveLength(0);

    // Messages are unreachable through the API but still present in the table —
    // that is what makes this reversible.
    expect(
      (await attendee.api.raw().get(`${API_URL}/api/chats/${chat.id}/messages`)).status()
    ).toBe(404);
    expect(await getMembership(chat.id, attendee.account.id)).not.toBeNull();

    const { hits } = await professor.api.search('باید در دیتابیس بماند');
    expect(hits).toHaveLength(0);
  });

  test('asks for confirmation first, and does nothing if you decline', async ({
    professor,
    newSession,
  }) => {
    const attendee = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'گروه مهم', [attendee.account.id]);

    await professor.page.goto(`/chats/${chat.id}`);
    await professor.page.getByRole('button', { name: 'تنظیمات گفت‌وگو' }).click();
    await professor.page.getByRole('menuitem', { name: 'حذف گروه' }).click();

    const dialog = professor.page.getByRole('dialog');
    await expect(dialog.getByText('حذف «گروه مهم»؟')).toBeVisible();

    await dialog.getByRole('button', { name: 'انصراف' }).click();
    expect((await attendee.api.raw().get(`${API_URL}/api/chats/${chat.id}`)).status()).toBe(200);

    await professor.page.getByRole('button', { name: 'تنظیمات گفت‌وگو' }).click();
    await professor.page.getByRole('menuitem', { name: 'حذف گروه' }).click();
    await professor.page.getByRole('dialog').getByRole('button', { name: 'بله، حذف کن' }).click();

    await expect(professor.page).toHaveURL('/chats');
    expect((await attendee.api.raw().get(`${API_URL}/api/chats/${chat.id}`)).status()).toBe(404);
  });

  test('is not something an admin who did not make the group may do', async ({
    student,
    newSession,
  }) => {
    const deputy = await newSession('STUDENT');
    const chat = await student.api.createGroup('CUSTOM_GROUP', 'گروه من', [deputy.account.id]);

    await student.api.updateMember(chat.id, deputy.account.id, { role: 'ADMIN' });

    const refused = await deputy.api.raw().delete(`${API_URL}/api/chats/${chat.id}`, { data: {} });
    expect(refused.status()).toBe(403);
  });

  test('cannot be done to a direct conversation', async ({ student, newSession }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    const refused = await student.api.raw().delete(`${API_URL}/api/chats/${chat.id}`, { data: {} });
    expect(refused.status()).toBe(403);
  });
});

test.describe('the roster notes in the transcript', () => {
  test('record who added whom, for everyone to see', async ({ professor, newSession }) => {
    const attendee = await newSession('STUDENT');
    const latecomer = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'کارگاه', [attendee.account.id]);

    await attendee.page.goto(`/chats/${chat.id}`);
    await expect(attendee.page.getByText('هنوز پیامی اینجا نیست')).toBeVisible();

    await professor.api.addMember(chat.id, latecomer.account.id);

    // Arrives over the socket, in the conversation, without a reload.
    await expect(
      attendee.page.getByText(
        `${professor.account.name} ${latecomer.account.name} را به گروه اضافه کرد`
      )
    ).toBeVisible();
  });

  test('record a removal too', async ({ professor, newSession }) => {
    const attendee = await newSession('STUDENT');
    const other = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'حذف', [
      attendee.account.id,
      other.account.id,
    ]);

    await professor.api
      .raw()
      .delete(`${API_URL}/api/chats/${chat.id}/members/${other.account.id}`, {
        data: {},
      });

    await attendee.page.goto(`/chats/${chat.id}`);
    await expect(
      attendee.page.getByText(`${professor.account.name} ${other.account.name} را از گروه حذف کرد`)
    ).toBeVisible();
  });

  test('do not count as unread', async ({ professor, newSession }) => {
    const attendee = await newSession('STUDENT');
    const latecomer = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'بی‌صدا', [attendee.account.id]);

    await professor.api.addMember(chat.id, latecomer.account.id);

    // "Someone joined" is not a message waiting for you.
    const [listed] = await attendee.api.listChats();
    expect(listed?.unreadCount).toBe(0);
  });
});
