import { API_URL, WEB_URL } from './support/env';
import { expect, test } from './support/fixtures';

/** One transparent pixel — enough to satisfy the magic-byte check. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// `multipart/form-data` is one of the content types `hono/csrf` guards, so a
// raw request has to carry the Origin a browser would send or it is refused
// before any validation runs.
test.describe('the avatar', () => {
  test('uploads, shows up for other people, and can be removed', async ({
    student,
    newSession,
  }) => {
    const peer = await newSession('STUDENT');

    await student.page.goto('/settings');
    await expect(
      student.page.getByRole('button', { name: 'انتخاب تصویر', exact: true })
    ).toBeVisible();

    await student.page.getByLabel('انتخاب تصویر پروفایل').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: PNG,
    });

    await expect(student.page.getByText('تصویر پروفایل به‌روز شد.')).toBeVisible();
    await expect(
      student.page.getByRole('button', { name: 'تغییر تصویر', exact: true })
    ).toBeVisible();

    // Anyone signed in may fetch it — the directory already lists every name.
    const seen = await peer.api.raw().get(`${API_URL}/api/users/${student.account.id}/avatar`);
    expect(seen.status()).toBe(200);
    expect(seen.headers()['content-type']).toContain('image/png');

    await student.page.getByRole('button', { name: 'حذف تصویر' }).click();
    await expect(student.page.getByText('تصویر پروفایل حذف شد.')).toBeVisible();

    const gone = await peer.api.raw().get(`${API_URL}/api/users/${student.account.id}/avatar`);
    expect(gone.status()).toBe(404);
  });

  test('refuses a file whose bytes disagree with its declared type', async ({ student }) => {
    const response = await student.api.raw().put(`${API_URL}/api/users/me/avatar`, {
      headers: { origin: WEB_URL },
      multipart: {
        avatar: {
          name: 'avatar.png',
          mimeType: 'image/png',
          buffer: Buffer.from('this is not a png'),
        },
      },
    });

    expect(response.status()).toBe(422);
  });

  test('refuses a type that is not a raster image', async ({ student }) => {
    // An SVG is a script the browser would run, so it is not on the list.
    const response = await student.api.raw().put(`${API_URL}/api/users/me/avatar`, {
      headers: { origin: WEB_URL },
      multipart: {
        avatar: {
          name: 'avatar.svg',
          mimeType: 'image/svg+xml',
          buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        },
      },
    });

    expect(response.status()).toBe(422);
  });

  test('needs a session', async ({ request }) => {
    const response = await request.get(
      `${API_URL}/api/users/00000000-0000-0000-0000-000000000000/avatar`
    );
    expect(response.status()).toBe(401);
  });
});
