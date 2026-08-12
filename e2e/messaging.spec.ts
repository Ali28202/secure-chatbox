import { expect, test } from './support/fixtures';

/**
 * Two people, one conversation, no refresh button.
 *
 * These are the tests the unit suite cannot write. Everything here needs two
 * real browsers with two real sockets talking to one server, and the thing being
 * proved — that something appearing in one window shows up in another — has no
 * meaning inside a single process.
 *
 * The arrangement matters for the realtime cases: the message is sent over the
 * *sender's* HTTP client, never through the watcher's browser. The watcher's tab
 * makes no request of its own, does nothing, and is not focused. Its query
 * client has `refetchOnWindowFocus: false` and no polling interval, so if the
 * message shows up there, the socket is the only thing that could have carried
 * it. Driving the send through the watcher's own UI would have proved nothing.
 */

test.describe('realtime delivery', () => {
  test('a message appears in the other person’s open conversation, unprompted', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('PROFESSOR');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);
    await expect(student.page.getByText('هنوز پیامی در این گفت‌وگو نیست')).toBeVisible();

    await peer.api.sendMessage(chat.id, 'سلام، تمرین این هفته را فرستادم.');

    await expect(student.page.getByText('سلام، تمرین این هفته را فرستادم.')).toBeVisible();
  });

  test('reorders the sidebar of someone who is not even in the conversation', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('PROFESSOR');
    const chat = await student.api.createDirectChat(peer.account.id);

    // Sitting on the list, not in the chat. A message arriving for a thread the
    // user is not looking at still has to surface — that is why the socket
    // bridge lives in the layout rather than on the conversation page.
    await student.page.goto('/chats');
    await expect(
      student.page.getByRole('link', { name: new RegExp(peer.account.name) })
    ).toBeVisible();

    await peer.api.sendMessage(chat.id, 'یادآوری: مهلت تحویل تا جمعه');

    await expect(student.page.getByText('یادآوری: مهلت تحویل تا جمعه')).toBeVisible();
    // One unread, in Persian digits, on the row it belongs to.
    await expect(student.page.getByText('۱', { exact: true })).toBeVisible();
  });

  test('upgrades to a real WebSocket rather than settling for polling', async ({ student }) => {
    const opened: string[] = [];
    // Attached before the navigation that mounts the bridge, or the connection
    // would be made before anything was listening for it.
    student.page.on('websocket', (ws) => opened.push(ws.url()));

    await student.page.goto('/chats');

    // engine.io opens on HTTP polling and upgrades, so the presence of a socket
    // at all is the assertion: a failed upgrade leaves the client working but
    // long-polling forever, which is exactly the failure that looks fine in
    // every other test.
    await expect
      .poll(() => opened.some((url) => url.includes('/socket.io/')), {
        message: 'expected a WebSocket to /socket.io/',
      })
      .toBe(true);
  });
});

test.describe('sending', () => {
  test('sends on Enter and clears the box', async ({ student, newSession }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);

    const composer = student.page.getByLabel('متن پیام');
    await composer.fill('سلام');
    await composer.press('Enter');

    await expect(student.page.getByText('سلام')).toBeVisible();
    await expect(composer).toHaveValue('');

    // And the other side got it without doing anything.
    await peer.page.goto(`/chats/${chat.id}`);
    await expect(peer.page.getByText('سلام')).toBeVisible();
  });

  test('Shift+Enter writes a second line instead of sending', async ({ student, newSession }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);

    const composer = student.page.getByLabel('متن پیام');
    await composer.fill('خط اول');
    await composer.press('Shift+Enter');
    await composer.type('خط دوم');

    await expect(composer).toHaveValue('خط اول\nخط دوم');
    await expect(student.page.getByText('هنوز پیامی در این گفت‌وگو نیست')).toBeVisible();
  });

  test('quotes the message being answered, on both sides', async ({ student, newSession }) => {
    const peer = await newSession('PROFESSOR');
    const chat = await student.api.createDirectChat(peer.account.id);
    await peer.api.sendMessage(chat.id, 'سؤالی دربارهٔ فصل سوم دارید؟');

    await student.page.goto(`/chats/${chat.id}`);
    await peer.page.goto(`/chats/${chat.id}`);

    const original = student.page.locator('[data-slot="message"]', {
      hasText: 'سؤالی دربارهٔ فصل سوم دارید؟',
    });
    await original.getByRole('button', { name: `گزینه‌های پیام ${peer.account.name}` }).click();
    await student.page.getByRole('menuitem', { name: 'پاسخ' }).click();

    await expect(student.page.getByText(`پاسخ به ${peer.account.name}`)).toBeVisible();

    await student.page.getByLabel('متن پیام').fill('بله، دربارهٔ صفحهٔ ۴۲');
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();

    // The quote travels with the message: the reply chain has to be legible to
    // the person being answered, not only to the person answering.
    const reply = peer.page.locator('[data-slot="message"]', { hasText: 'بله، دربارهٔ صفحهٔ ۴۲' });
    await expect(reply).toContainText('سؤالی دربارهٔ فصل سوم دارید؟');
  });
});

test.describe('deleting', () => {
  test('leaves a tombstone in both windows rather than a hole', async ({ student, newSession }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);
    await peer.page.goto(`/chats/${chat.id}`);

    await student.page.getByLabel('متن پیام').fill('این را اشتباه فرستادم');
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();
    await expect(peer.page.getByText('این را اشتباه فرستادم')).toBeVisible();

    const bubble = student.page.locator('[data-slot="message"]', {
      hasText: 'این را اشتباه فرستادم',
    });
    await bubble.getByRole('button', { name: `گزینه‌های پیام ${student.account.name}` }).click();
    await student.page.getByRole('menuitem', { name: 'حذف پیام' }).click();

    // The row stays so that anything replying to it still points somewhere, and
    // the other side is told rather than watching a message silently vanish.
    await expect(student.page.getByText('این پیام حذف شده است.')).toBeVisible();
    await expect(peer.page.getByText('این پیام حذف شده است.')).toBeVisible();
    await expect(peer.page.getByText('این را اشتباه فرستادم')).toBeHidden();
  });
});

test.describe('pinning', () => {
  test('a professor pins a message and everyone sees the banner', async ({
    professor,
    newSession,
  }) => {
    const attendee = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'شبکه‌های کامپیوتری', [
      attendee.account.id,
    ]);
    await professor.api.sendMessage(chat.id, 'امتحان میان‌ترم: ۲۵ آبان');

    await professor.page.goto(`/chats/${chat.id}`);
    await attendee.page.goto(`/chats/${chat.id}`);

    const bubble = professor.page.locator('[data-slot="message"]', {
      hasText: 'امتحان میان‌ترم: ۲۵ آبان',
    });
    await bubble.getByRole('button', { name: `گزینه‌های پیام ${professor.account.name}` }).click();
    await professor.page.getByRole('menuitem', { name: 'سنجاق کردن' }).click();

    await expect(
      attendee.page.getByText(`پیام سنجاق‌شده از ${professor.account.name}`)
    ).toBeVisible();
  });
});
