import { API_URL } from './support/env';
import { expect, test } from './support/fixtures';

test.describe('sessions', () => {
  test('lists the sign-in you are using, and marks it as yours', async ({ student }) => {
    const { sessions } = await student.api.listSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.isCurrent).toBe(true);
    // The device id is the session's secret half and is never sent back.
    expect(Object.keys(sessions[0] ?? {})).not.toContain('deviceId');
  });

  test('revoking one stops its token immediately, not at expiry', async ({ student }) => {
    const { sessions } = await student.api.listSessions();
    const current = sessions[0]!;

    // Still signed in at this point.
    expect((await student.api.raw().get(`${API_URL}/api/auth/me`)).status()).toBe(200);

    const revoked = await student.api
      .raw()
      .delete(`${API_URL}/api/auth/sessions/${current.id}`, { data: {} });
    expect(revoked.status()).toBe(200);

    // This is the whole point of the table: the cookie is unchanged and still
    // unexpired, and it no longer works.
    const after = await student.api.raw().get(`${API_URL}/api/auth/me`);
    expect(after.status()).toBe(401);
  });

  test('logging out revokes the row, not only the cookies', async ({ student }) => {
    const before = await student.api.listSessions();
    expect(before.sessions).toHaveLength(1);

    await student.api.logout();

    const after = await student.api.raw().get(`${API_URL}/api/auth/me`);
    expect(after.status()).toBe(401);
  });

  test('cannot be ended by someone else who guesses its id', async ({ student, newSession }) => {
    const stranger = await newSession('STUDENT');
    const { sessions } = await student.api.listSessions();

    const attempt = await stranger.api
      .raw()
      .delete(`${API_URL}/api/auth/sessions/${sessions[0]!.id}`, { data: {} });
    expect(attempt.status()).toBe(404);

    // And the owner's session is untouched.
    expect((await student.api.raw().get(`${API_URL}/api/auth/me`)).status()).toBe(200);
  });
});
