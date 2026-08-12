import { getReceiptStatus } from './support/db';
import { expect, test } from './support/fixtures';

/**
 * Who has read what.
 *
 * The interesting half is that READ is decided by the *reader's* browser, not
 * the server: an `IntersectionObserver` watches the message rows and reports the
 * newest one that has actually been on screen. Nothing about that survives being
 * tested outside a browser — there is no layout in jsdom, so there is no
 * intersection, so the observer never fires and the whole mechanism is a no-op
 * that passes. Every assertion below depends on Chromium really laying the
 * conversation out and really scrolling it.
 */

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

    /*
     * Wait for the receipt before leaving, because the report is not sent the
     * instant a row appears: the observer batches, and only after the list has
     * been still for `SETTLE_MS` does the newest visible message go to the
     * server. Clicking straight back beats that timer and its cleanup clears it,
     * so nothing is ever reported — which made this test a race that happened to
     * win on a fast machine and lost the first time CI ran it with two workers.
     *
     * Waiting keeps the assertion pointed at the badge rather than at the timer.
     * (That a reader who leaves within 400ms keeps their unread badge until they
     * open the chat again is the app's behaviour, not a flaw in this test.)
     */
    await expect
      .poll(() => getReceiptStatus(unread.id, student.account.id), {
        message: 'expected the read to be reported before leaving the conversation',
      })
      .toBe('READ');

    // A `button`, not a `link`: it is a `Link` underneath, but the Button it is
    // rendered through keeps `role="button"`.
    await student.page.getByRole('button', { name: 'بازگشت' }).click();
    await expect(student.page.getByRole('heading', { name: 'گفت‌وگوها' })).toBeVisible();

    // Reading it is what clears it — there is no "mark as read" button, and a
    // count that survived the reading would be a count nobody could get rid of.
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

    await peer.api.sendMessage(chat.id, 'یک');
    await peer.api.sendMessage(chat.id, 'دو');
    await peer.api.sendMessage(chat.id, 'سه');

    const row = student.page.getByRole('link', { name: new RegExp(peer.account.name) });
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

    // One tick: it left, and nobody has looked at it.
    await expect(student.page.getByRole('img', { name: 'ارسال شد' })).toBeVisible();

    await peer.page.goto(`/chats/${chat.id}`);

    // Two bright ticks, pushed back over the socket without the sender doing
    // anything — the whole point of a receipt is that it arrives on its own.
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

    // Sent over HTTP so the id is in hand for the database assertion below; the
    // ticks are the sender's view of their own message either way.
    const message = await professor.api.sendMessage(chat.id, 'تمرین سری دوم بارگذاری شد.');

    await professor.page.goto(`/chats/${chat.id}`);
    await expect(professor.page.getByRole('img', { name: 'ارسال شد' })).toBeVisible();

    await present.page.goto(`/chats/${chat.id}`);

    // "Someone has read this" and "the class has read this" look identical as a
    // pair of ticks, so in a group the count goes in the label.
    await expect(
      professor.page.getByRole('img', { name: 'خوانده‌شده توسط ۱ نفر از ۲ نفر' })
    ).toBeVisible();

    // `absent` never opened it, and the row proves the tick is reporting the
    // database rather than an optimistic guess in the sender's browser.
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

    // No row for the sender: you do not read your own message, and writing one
    // would make every group's "read by" count one too many.
    expect(await getReceiptStatus(message.id, student.account.id)).toBeNull();
  });
});
