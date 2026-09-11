import { expect, test } from './support/fixtures';

test.describe('realtime delivery', () => {
  test('a message appears in the other person’s open conversation, unprompted', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('PROFESSOR');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);
    await expect(student.page.getByText('هنوز پیامی اینجا نیست')).toBeVisible();

    await peer.api.sendMessage(chat.id, 'سلام، تمرین این هفته را فرستادم.');

    await expect(student.page.getByText('سلام، تمرین این هفته را فرستادم.')).toBeVisible();
  });

  test('reorders the sidebar of someone who is not even in the conversation', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('PROFESSOR');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto('/chats');
    await expect(
      student.page.getByRole('link', { name: new RegExp(peer.account.name) })
    ).toBeVisible();

    await peer.api.sendMessage(chat.id, 'یادآوری: مهلت تحویل تا جمعه');

    await expect(student.page.getByText('یادآوری: مهلت تحویل تا جمعه')).toBeVisible();
    await expect(student.page.getByText('۱', { exact: true })).toBeVisible();
  });

  test('upgrades to a real WebSocket rather than settling for polling', async ({ student }) => {
    const opened: string[] = [];
    student.page.on('websocket', (ws) => opened.push(ws.url()));

    await student.page.goto('/chats');

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
    await expect(student.page.getByText('هنوز پیامی اینجا نیست')).toBeVisible();
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
    await student.page.getByRole('menuitem', { name: 'ریپلای' }).click();

    await expect(student.page.getByText(`ریپلای به ${peer.account.name}`)).toBeVisible();

    await student.page.getByLabel('متن پیام').fill('بله، دربارهٔ صفحهٔ ۴۲');
    await student.page.getByRole('button', { name: 'ارسال پیام' }).click();

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
    await professor.page.getByRole('menuitem', { name: 'پین‌ کردن' }).click();

    await expect(
      attendee.page.getByText(`پیام پین‌شده از ${professor.account.name}`)
    ).toBeVisible();
  });
});
