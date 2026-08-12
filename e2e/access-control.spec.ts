import { randomUUID } from 'node:crypto';
import { getMembership } from './support/db';
import { API_URL } from './support/env';
import { expect, test } from './support/fixtures';
import type { APIResponse } from '@playwright/test';

/**
 * Who may do what, and what happens when they try anyway.
 *
 * Every rule here is written once in `packages/shared/src/policy.ts` and read
 * twice: by the web app, to decide what to draw, and by the API, to decide what
 * to allow. So every case below is tested twice too — once through the
 * interface, where the absence of a button is the assertion, and once with a
 * direct request that skips the interface entirely.
 *
 * The second half is the half that matters. A missing button is a courtesy; the
 * only thing standing between a student and a course group they should not be
 * able to create is the server, and the only way to know the server is doing it
 * is to ask the server without the browser's help. `api.raw()` is that request:
 * it carries the same session cookies and none of the UI's restraint.
 */

interface Refusal {
  status: number;
  code: string;
  message: string;
}

/** A refused response, flattened to the three things worth asserting on. */
async function refusal(response: APIResponse): Promise<Refusal> {
  const body = (await response.json()) as { error: { code: string; message: string } };
  return { status: response.status(), code: body.error.code, message: body.error.message };
}

test.describe('what a student may create', () => {
  test('is not offered a course group, and cannot ask for one anyway', async ({ student }) => {
    await student.page.goto('/chats');
    await student.page.getByRole('button', { name: 'گفت‌وگوی جدید' }).click();

    const dialog = student.page.getByRole('dialog');
    await dialog.getByRole('tab', { name: 'گروه' }).click();

    // Not a disabled option — absent. A student has exactly one kind of group
    // available to them, and a picker with one choice in it is a control that
    // asks a question with no answer. `new-chat-dialog` drops the whole group
    // when the list has one entry, which is why the container is checked too.
    await expect(dialog.getByRole('group', { name: 'نوع گروه' })).toBeHidden();
    await expect(dialog.getByRole('button', { name: 'گروه درسی' })).toBeHidden();

    await dialog.getByLabel('نام گروه').fill('گروه مطالعاتی ترم');
    await dialog.getByRole('button', { name: 'ساخت گروه' }).click();
    await expect(student.page).toHaveURL(/\/chats\/[0-9a-f-]{36}$/);

    // What they got is the ordinary kind. Students organising a study group is
    // the platform working, so this is a narrowing rather than a refusal.
    const [chat] = await student.api.listChats();
    expect(chat?.type).toBe('CUSTOM_GROUP');
  });

  test('is refused by the API, not only by the picker', async ({ student }) => {
    // The request the dialog will not make, made anyway.
    const response = await student.api
      .raw()
      .post(`${API_URL}/api/chats`, { data: { type: 'COURSE_GROUP', title: 'درس جعلی' } });

    expect(await refusal(response)).toEqual({
      status: 403,
      code: 'FORBIDDEN',
      message: 'ساخت گروه درسی تنها از عهدهٔ استادان برمی‌آید.',
    });

    // And nothing was created on the way to being refused.
    expect(await student.api.listChats()).toHaveLength(0);
  });
});

test.describe('conversations you are not part of', () => {
  test('look exactly like conversations that do not exist', async ({ professor, newSession }) => {
    const outsider = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'شورای گروه');

    const real = await outsider.api.raw().get(`${API_URL}/api/chats/${chat.id}`);
    const imaginary = await outsider.api.raw().get(`${API_URL}/api/chats/${randomUUID()}`);

    // Identical, deliberately. A 403 for the first and a 404 for the second
    // would turn the endpoint into a way of asking whether a given chat exists
    // — and the ids are in URLs people paste to each other.
    expect(await refusal(real)).toEqual(await refusal(imaginary));
    expect(real.status()).toBe(404);
  });

  test('tell the visitor plainly rather than showing an empty room', async ({
    professor,
    newSession,
  }) => {
    const outsider = await newSession('STUDENT');
    const chat = await professor.api.createGroup('CUSTOM_GROUP', 'جلسات داخلی');

    await outsider.page.goto(`/chats/${chat.id}`);

    // Both possibilities in one sentence, because the page genuinely cannot
    // tell them apart — and must not be able to.
    await expect(outsider.page.getByText('این گفت‌وگو در دسترس نیست')).toBeVisible();
    await expect(outsider.page.getByText('یا حذف شده است، یا شما عضو آن نیستید.')).toBeVisible();
    // A `Link` rendered through `Button`, so it keeps `role="button"`.
    await expect(
      outsider.page.getByRole('button', { name: 'بازگشت به فهرست گفت‌وگوها' })
    ).toBeVisible();
  });

  test('cannot be written into from outside', async ({ professor, newSession }) => {
    const outsider = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'ریاضی ۲');

    const response = await outsider.api
      .raw()
      .post(`${API_URL}/api/chats/${chat.id}/messages`, { data: { content: 'سلام' } });

    expect(response.status()).toBe(404);
  });
});

test.describe('a read-only chat', () => {
  test('is closed by the professor and read by the class', async ({ professor, newSession }) => {
    const attendee = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'اعلانات دانشکده', [
      attendee.account.id,
    ]);

    await professor.page.goto(`/chats/${chat.id}`);

    // `exact`, because role names match as substrings and «بازگشت» — the back
    // button sitting next to this one — contains «باز».
    const toggle = professor.page.getByRole('button', { name: 'باز', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();

    // A two-state control, so the state is in `aria-pressed` rather than left
    // for the reader to infer from the label.
    await expect(
      professor.page.getByRole('button', { name: 'فقط‌خواندنی', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');

    await attendee.page.goto(`/chats/${chat.id}`);

    // The student is told, and told the same sentence the API would have
    // answered with — `SEND_BLOCK_MESSAGES` is one string read by both.
    await expect(attendee.page.getByLabel('متن پیام')).toBeHidden();
    await expect(attendee.page.getByText('این گفت‌وگو فقط‌خواندنی است.')).toBeVisible();

    const response = await attendee.api
      .raw()
      .post(`${API_URL}/api/chats/${chat.id}/messages`, { data: { content: 'ولی من می‌خواهم' } });
    expect(await refusal(response)).toEqual({
      status: 403,
      code: 'FORBIDDEN',
      message: 'این گفت‌وگو فقط‌خواندنی است.',
    });

    // Announcements still work, which is the entire point of the mode.
    await professor.page.getByLabel('متن پیام').fill('کلاس فردا برگزار نمی‌شود.');
    await professor.page.getByRole('button', { name: 'ارسال پیام' }).click();
    await expect(attendee.page.getByText('کلاس فردا برگزار نمی‌شود.')).toBeVisible();
  });

  test('is not something either side of a direct conversation can impose', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('STUDENT');
    const chat = await student.api.createDirectChat(peer.account.id);

    await student.page.goto(`/chats/${chat.id}`);
    await expect(student.page.getByRole('heading', { name: peer.account.name })).toBeVisible();

    // Both participants are ADMIN — there is no hierarchy between two people —
    // so a rule that only read `ChatRole` would hand each of them a way to
    // silence the other.
    await expect(student.page.getByRole('button', { name: 'باز', exact: true })).toBeHidden();

    const response = await student.api
      .raw()
      .patch(`${API_URL}/api/chats/${chat.id}`, { data: { isReadOnly: true } });
    expect(response.status()).toBe(403);
  });
});

test.describe('moderating a course group', () => {
  test('a student can answer a professor’s message but not remove or pin it', async ({
    professor,
    newSession,
  }) => {
    const attendee = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'پایگاه داده', [
      attendee.account.id,
    ]);
    const message = await professor.api.sendMessage(chat.id, 'منابع امتحان اعلام شد.');

    await attendee.page.goto(`/chats/${chat.id}`);

    const bubble = attendee.page.locator('[data-slot="message"]', {
      hasText: 'منابع امتحان اعلام شد.',
    });
    await bubble.getByRole('button', { name: `گزینه‌های پیام ${professor.account.name}` }).click();

    // Reply survives, which is the point of showing the menu at all: the
    // student is a participant, not a spectator.
    await expect(attendee.page.getByRole('menuitem', { name: 'پاسخ' })).toBeVisible();
    await expect(attendee.page.getByRole('menuitem', { name: 'حذف پیام' })).toBeHidden();
    await expect(attendee.page.getByRole('menuitem', { name: 'سنجاق کردن' })).toBeHidden();

    // `data: {}` on a request that needs no body: the CSRF guard treats a
    // missing `Content-Type` as `text/plain` and refuses it, because that is a
    // shape a hostile page could send cross-origin without a preflight. Being
    // refused by the wrong guard would look like a passing test.
    const deleted = await attendee.api
      .raw()
      .delete(`${API_URL}/api/chats/${chat.id}/messages/${message.id}`, { data: {} });
    expect(await refusal(deleted)).toEqual({
      status: 403,
      code: 'FORBIDDEN',
      message: 'تنها فرستندهٔ پیام یا مدیر گفت‌وگو می‌تواند آن را حذف کند.',
    });

    const pinned = await attendee.api
      .raw()
      .patch(`${API_URL}/api/chats/${chat.id}/messages/${message.id}/pin`, {
        data: { isPinned: true },
      });
    expect(await refusal(pinned)).toEqual({
      status: 403,
      code: 'FORBIDDEN',
      message: 'فقط مدیر گفت‌وگو می‌تواند پیام‌ها را سنجاق کند.',
    });
  });

  test('the professor can remove a student’s message', async ({ professor, newSession }) => {
    const attendee = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'سیستم‌عامل', [
      attendee.account.id,
    ]);
    await attendee.api.sendMessage(chat.id, 'پیام نامناسب');

    await professor.page.goto(`/chats/${chat.id}`);

    // The other half of the same rule: moderation is what `ChatRole.ADMIN` is
    // for, and a professor who could not remove anything in their own course
    // group would have the role in name only.
    const bubble = professor.page.locator('[data-slot="message"]', { hasText: 'پیام نامناسب' });
    await bubble.getByRole('button', { name: `گزینه‌های پیام ${attendee.account.name}` }).click();
    await professor.page.getByRole('menuitem', { name: 'حذف پیام' }).click();

    await expect(professor.page.getByText('این پیام حذف شده است.')).toBeVisible();
  });
});

test.describe('managing members', () => {
  test('an admin mutes someone, and the membership row says so', async ({
    professor,
    newSession,
  }) => {
    const attendee = await newSession('STUDENT');
    const chat = await professor.api.createGroup('COURSE_GROUP', 'هوش مصنوعی پیشرفته', [
      attendee.account.id,
    ]);

    await professor.page.goto(`/chats/${chat.id}`);
    await professor.page.getByRole('button', { name: '۲ عضو' }).click();

    const dialog = professor.page.getByRole('dialog');
    await expect(dialog.getByText('اعضای گفت‌وگو')).toBeVisible();

    await dialog.getByRole('button', { name: `مدیریت عضویت ${attendee.account.name}` }).click();
    await professor.page.getByRole('menuitem', { name: 'بی‌صدا کردن' }).click();

    await expect(dialog.getByText('بی‌صدا')).toBeVisible();

    // Asserted against the row rather than the marker, because the marker is
    // drawn from a cache the mutation just wrote to — it would be green whether
    // or not the request ever reached the database.
    await expect
      .poll(() => getMembership(chat.id, attendee.account.id).then((row) => row?.isMuted), {
        message: 'expected the membership row to be muted',
      })
      .toBe(true);
  });

  test('an ordinary member is offered nothing to manage, and gets nowhere alone', async ({
    professor,
    newSession,
  }) => {
    const attendee = await newSession('STUDENT');
    const other = await newSession('STUDENT');
    const chat = await professor.api.createGroup('CUSTOM_GROUP', 'گروه تمرین', [
      attendee.account.id,
      other.account.id,
    ]);

    await attendee.page.goto(`/chats/${chat.id}`);
    await attendee.page.getByRole('button', { name: '۳ عضو' }).click();

    const dialog = attendee.page.getByRole('dialog');
    await expect(dialog.getByText(professor.account.name)).toBeVisible();

    // The list is visible to everyone — knowing who is in a group you are in is
    // not a privilege — but nothing in it is actionable.
    await expect(
      dialog.getByRole('button', { name: `مدیریت عضویت ${other.account.name}` })
    ).toBeHidden();

    const response = await attendee.api
      .raw()
      .patch(`${API_URL}/api/chats/${chat.id}/members/${other.account.id}`, {
        data: { isMuted: true },
      });
    expect(response.status()).toBe(403);

    // And could not simply add themselves an ally either.
    const added = await attendee.api
      .raw()
      .post(`${API_URL}/api/chats/${chat.id}/members`, { data: { userId: attendee.account.id } });
    expect(added.status()).toBe(403);
  });
});
