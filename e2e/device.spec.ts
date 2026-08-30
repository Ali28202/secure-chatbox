import { ERROR_CODES } from '@repo/shared';
import { Api, deviceIdFor } from './support/api';
import { getBoundDevice } from './support/db';
import { API_URL } from './support/env';
import { expect, test } from './support/fixtures';

test.describe('a second device', () => {
  test('ends the session on the first one', async ({ student, request }) => {
    await new Api(request).login(student.account, deviceIdFor(student.account, 'second'));

    const response = await student.api.raw().get(`${API_URL}/api/auth/me`);

    expect(response.status()).toBe(401);
    expect((await response.json()).error?.code).toBe(ERROR_CODES.DEVICE_MISMATCH);
  });

  test('leaves the account holding it, and only it', async ({ student, request }) => {
    const second = deviceIdFor(student.account, 'second');
    expect(await getBoundDevice(student.account.id)).toBe(deviceIdFor(student.account));

    await new Api(request).login(student.account, second);

    expect(await getBoundDevice(student.account.id)).toBe(second);
  });

  test('cannot be worked around by refreshing', async ({ student, request }) => {
    await new Api(request).login(student.account, deviceIdFor(student.account, 'second'));

    const response = await student.api
      .raw()
      .post(`${API_URL}/api/auth/refresh`, { data: {} })
      .catch(() => null);

    expect(response?.status()).toBe(401);
    expect((await response!.json()).error?.code).toBe(ERROR_CODES.DEVICE_MISMATCH);
  });

  test('closes the sockets the displaced device had open', async ({ student, request }) => {
    const sockets: { isClosed(): boolean }[] = [];
    student.page.on('websocket', (ws) => {
      if (ws.url().includes('/socket.io/')) sockets.push(ws);
    });

    await student.page.goto('/chats');
    await expect
      .poll(() => sockets.length, { message: 'expected a socket to /socket.io/' })
      .toBeGreaterThan(0);

    await new Api(request).login(student.account, deviceIdFor(student.account, 'second'));

    await expect
      .poll(() => sockets[0]?.isClosed(), { message: 'expected the displaced socket to close' })
      .toBe(true);
  });

  test('sends the displaced tab back to the login page and says why', async ({
    student,
    request,
  }) => {
    await student.page.goto('/chats');
    await expect(student.page.getByRole('heading', { name: 'گفت‌وگوها' })).toBeVisible();

    await new Api(request).login(student.account, deviceIdFor(student.account, 'second'));

    await student.page.reload();

    await expect(student.page).toHaveURL(/\/login/);
    await expect(
      student.page.getByText('حساب شما روی دستگاه دیگری وارد شده است.', { exact: false })
    ).toBeVisible();
  });

  test('does not displace anything when it is the same device again', async ({
    student,
    request,
  }) => {
    await new Api(request).login(student.account);

    const response = await student.api.raw().get(`${API_URL}/api/auth/me`);
    expect(response.status()).toBe(200);
  });
});

test.describe('the displaced device', () => {
  test('can sign straight back in, which displaces the other one', async ({ student, request }) => {
    const other = new Api(request);
    await other.login(student.account, deviceIdFor(student.account, 'second'));
    expect((await student.api.raw().get(`${API_URL}/api/auth/me`)).status()).toBe(401);

    await student.api.login(student.account);

    expect((await student.api.raw().get(`${API_URL}/api/auth/me`)).status()).toBe(200);
    expect((await other.raw().get(`${API_URL}/api/auth/me`)).status()).toBe(401);
  });
});
