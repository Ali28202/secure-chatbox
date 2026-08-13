import {
  ERROR_CODES,
  FA_ERROR_MESSAGES,
  isApiErrorBody,
  type ApiErrorBody,
  type FieldIssue,
} from '@repo/shared';
import axios, { isAxiosError, type InternalAxiosRequestConfig } from 'axios';
import { DEVICE_MISMATCH_PARAM, ROUTES } from '@/lib/routes';

/**
 * Where the API lives *as seen from the browser*.
 *
 * In development the two apps are separate origins (`:3000` and `:3001`), so
 * this is an absolute URL and every request is a CORS request. In production
 * nginx puts both behind one origin, so the deployment sets
 * `NEXT_PUBLIC_API_URL=""` and the paths below become same-origin — which is
 * why the fallback uses `??` rather than `||`: an empty string is a deliberate
 * configuration, not a missing one.
 *
 * `NEXT_PUBLIC_*` is inlined at build time, so changing it needs a rebuild.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  // The access and refresh tokens are httpOnly cookies: JavaScript cannot read
  // them, so it cannot attach them either. This tells the browser to send them
  // on cross-origin requests — and the API's `cors({ credentials: true })` is
  // what makes the browser accept the response.
  withCredentials: true,
  // Always JSON, even for bodyless posts. The API's CSRF guard treats a request
  // with no `Content-Type` as `text/plain` and blocks it, because that shape can
  // be sent cross-origin without a preflight; `application/json` cannot.
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Where the browser loads an attachment from.
 *
 * Not fetched through the axios instance: this string goes into `src` and
 * `href`, and the browser makes the request itself. That still arrives
 * authenticated, because the session cookies are `SameSite=Lax` and ports are
 * not part of a "site" — `localhost:3000` and `localhost:3001` are the same
 * site, so a subresource request from one carries the other's cookies. Behind
 * nginx it is a single origin and the question never comes up.
 *
 * What comes back is not the file but a 302 into the S3 bucket, signed and
 * good for a few minutes. The browser follows it without being asked and the
 * distinction is invisible here — but it is why nothing in this app ever holds
 * an attachment's real URL, and why a stale one stops working on its own.
 *
 * The consequence worth knowing: this cannot be a `next/image` source. That
 * component proxies through the optimizer on the *web* server, which has no
 * session and would be answered with a 401.
 */
export function attachmentUrl(attachmentId: string): string {
  return `${API_BASE_URL}/api/attachments/${attachmentId}`;
}

/**
 * Requests that must never trigger a refresh of their own.
 *
 * `/auth/refresh` for the obvious reason — a 401 from the refresh endpoint
 * means the refresh token itself is dead, and retrying it is an infinite loop.
 * The others because a 401 there is the *answer*, not a session problem: a
 * wrong password should surface as a wrong password, not as a silent refresh
 * attempt followed by a confusing second failure.
 */
const NEVER_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

type RetriableRequest = InternalAxiosRequestConfig & { _retried?: boolean };

/**
 * The in-flight refresh, shared by every request that hits a 401 while it runs.
 *
 * A chat screen fires several queries at once — chats, messages, unread counts.
 * When the access token expires they all get a 401 within milliseconds of each
 * other. Without this, each would post its own `/auth/refresh`, and since every
 * refresh rotates *both* tokens, the second one to arrive would be presenting a
 * token the first had already replaced: a burst of self-inflicted logouts.
 * Sharing one promise means one rotation, and everyone replays against it.
 */
let refreshInFlight: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  refreshInFlight ??= api.post('/auth/refresh', {}).then(
    () => {
      refreshInFlight = null;
    },
    (error: unknown) => {
      refreshInFlight = null;
      throw error;
    }
  );
  return refreshInFlight;
}

/**
 * Guards the forced re-login below, which several failing requests would
 * otherwise start at once — a chat screen has three or four queries in flight
 * and they all fail together.
 */
let signingOut = false;

/**
 * Ends the session and sends the browser back to the login page, saying why.
 *
 * A full page load rather than a router push, and that is the point: the
 * account is now on another device, so everything this tab holds — cached
 * chats, the auth store, an open socket — describes a session that no longer
 * exists. Reloading is the only way to be sure none of it survives.
 *
 * The logout first is what makes it stick. `/auth/logout` only clears cookies,
 * needs no valid session, and without it `session_hint` would still be set and
 * the proxy would wave the next navigation straight back into the app.
 */
async function forceReLogin(): Promise<void> {
  if (signingOut || typeof window === 'undefined') return;
  signingOut = true;

  // Failure here is not worth handling: the redirect below has to happen either
  // way, and a user staring at a dead session is not helped by an error toast.
  await api.post('/auth/logout', {}).catch(() => undefined);

  window.location.replace(`${ROUTES.login}?${DEVICE_MISMATCH_PARAM}=1`);
}

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!isAxiosError(error) || error.response?.status !== 401) {
      throw error;
    }

    const request = error.config as RetriableRequest | undefined;
    const url = request?.url ?? '';
    if (!request || request._retried || NEVER_REFRESH.some((path) => url.startsWith(path))) {
      throw error;
    }

    // A session displaced by a login from another device. Refreshing cannot fix
    // it — the refresh token is bound to the same dead device and would fail
    // the identical check — so the round trip is skipped and the user is told
    // what actually happened instead of "your session expired".
    if (getApiError(error)?.code === ERROR_CODES.DEVICE_MISMATCH) {
      await forceReLogin();
      throw error;
    }

    // Marked before awaiting, so the replay below can only ever happen once per
    // request no matter how the refresh turns out.
    request._retried = true;

    try {
      await refreshSession();
    } catch {
      // Rethrow the *original* 401, not the refresh's. The caller asked for
      // messages and deserves to hear about messages; that the recovery attempt
      // also failed is our business, and the session is over either way.
      throw error;
    }

    return api(request);
  }
);

/** Pulls the API's error envelope out of any thrown value, or `null`. */
export function getApiError(error: unknown): ApiErrorBody['error'] | null {
  if (!isAxiosError(error)) return null;
  const body: unknown = error.response?.data;
  return isApiErrorBody(body) ? body.error : null;
}

/**
 * Persian text for any failure, ready to drop into a toast.
 *
 * Falls back to a network message rather than a generic one, because when the
 * envelope is missing the request usually never reached the API at all — the
 * intranet dropped, or the server is down. Telling the user that is more useful
 * than "something went wrong".
 */
export function getApiErrorMessage(error: unknown): string {
  return (
    getApiError(error)?.message ??
    'ارتباط با سرور برقرار نشد. اتصال خود به شبکهٔ دانشگاه را بررسی کنید.'
  );
}

/** Per-field validation issues, for handing to react-hook-form's `setError`. */
export function getApiFieldIssues(error: unknown): FieldIssue[] {
  return getApiError(error)?.details ?? [];
}

/** Re-exported so screens can render a message for a code they raise locally. */
export { FA_ERROR_MESSAGES };
