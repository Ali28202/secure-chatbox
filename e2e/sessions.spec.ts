import { API_URL } from './support/env';
import { expect, test } from './support/fixtures';

test.describe('sessions', () => {
  test('lists the sign-in you are using, and marks it as yours', async ({ student }) => {
    const { sessions } = await student.api.listSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.isCurrent).toBe(true);
    expect(Object.keys(sessions[0] ?? {})).not.toContain('deviceId');
  });

  test('revoking one stops its token immediately, not at expiry', async ({ student }) => {
    const { sessions } = await student.api.listSessions();
    const current = sessions[0]!;

    expect((await student.api.raw().get(`${API_URL}/api/auth/me`)).status()).toBe(200);

    const revoked = await student.api
      .raw()
      .delete(`${API_URL}/api/auth/sessions/${current.id}`, { data: {} });
    expect(revoked.status()).toBe(200);

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

    expect((await student.api.raw().get(`${API_URL}/api/auth/me`)).status()).toBe(200);
  });
});
