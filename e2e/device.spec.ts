import { ERROR_CODES } from '@repo/shared';
import { Api, deviceIdFor } from './support/api';
import { getBoundDevice } from './support/db';
import { API_URL } from './support/env';
import { expect, test } from './support/fixtures';

/**
 * One account, one device at a time.
 *
 * A session here is not merely signed, it is *bound*: the token carries the
 * device it was minted for and the account carries the one device it currently
 * holds, and a request is answered only when those agree. Signing in somewhere
 * else overwrites the column, and every token issued to the device it replaced
 * stops working on its next request.
 *
 * That makes the eviction path something only an end-to-end test can reach. The
 * unit suite proves the service returns the right verdict; nothing below the
 * browser can prove that the displaced tab notices, stops asking, and lands back
 * on the login page with an explanation rather than in a refresh loop.
 *
 * `deviceIdFor` gives every account a stable device so ordinary tests never
 * evict themselves — the second device in each test below is explicit, and is
 * the only thing that differs from an ordinary second login.
 */

test.describe('a second device', () => {
  test('ends the session on the first one', async ({ student, request }) => {
    // A separate request context, so this login has its own cookie jar and does
    // not simply overwrite the student's — the point is that the *old* cookies
    // stop working while still sitting in the browser that holds them.
    await new Api(request).login(student.account, deviceIdFor(student.account, 'second'));

    const response = await student.api.raw().get(`${API_URL}/api/auth/me`);

    expect(response.status()).toBe(401);
    // A code of its own, and not `UNAUTHORIZED`: the client must not answer this
    // by refreshing, because the refresh token is bound to the same dead device
    // and would fail the identical check.
    expect((await response.json()).error?.code).toBe(ERROR_CODES.DEVICE_MISMATCH);
  });

  test('leaves the account holding it, and only it', async ({ student, request }) => {
    const second = deviceIdFor(student.account, 'second');
    expect(await getBoundDevice(student.account.id)).toBe(deviceIdFor(student.account));

    await new Api(request).login(student.account, second);

    // One column, one device. With stateless tokens this *is* the session list,
    // which is why a login writes it rather than appending anywhere.
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
    // Socket.io authenticates once, at the handshake, and never again — so an
    // open socket would otherwise keep receiving messages for an account that
    // has moved on. Nothing about the HTTP checks above reaches it; the gateway
    // has to be told to go and close it.
    // Filtered to `/socket.io/`, because Next's dev server opens an HMR socket
    // of its own and it opens first — an unfiltered `[0]` watches the wrong
    // connection and never closes.
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

    // The tab has no idea yet — nothing polls, and `refetchOnWindowFocus` is
    // off. It finds out at its next request, which is what a reload forces.
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
    // By far the common case: a second tab, a reopened browser, a fresh login
    // after a logout. Treating it as a new device would close the sockets of the
    // very session being created.
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

    // Not a lockout — losing the session is not losing the account. Signing in
    // again from here rebinds it, and now it is the other device that is out.
    await student.api.login(student.account);

    expect((await student.api.raw().get(`${API_URL}/api/auth/me`)).status()).toBe(200);
    expect((await other.raw().get(`${API_URL}/api/auth/me`)).status()).toBe(401);
  });
});
