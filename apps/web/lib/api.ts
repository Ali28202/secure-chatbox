import {
  ERROR_CODES,
  FA_ERROR_MESSAGES,
  isApiErrorBody,
  type ApiErrorBody,
  type FieldIssue,
} from '@repo/shared';
import axios, { isAxiosError, type InternalAxiosRequestConfig } from 'axios';
import { DEVICE_MISMATCH_PARAM, ROUTES } from '@/lib/routes';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export function attachmentUrl(attachmentId: string): string {
  return `${API_BASE_URL}/api/attachments/${attachmentId}`;
}

export function avatarUrl(userId: string): string {
  return `${API_BASE_URL}/api/users/${userId}/avatar`;
}

const NEVER_REFRESH = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

type RetriableRequest = InternalAxiosRequestConfig & { _retried?: boolean };

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

let signingOut = false;

async function forceReLogin(): Promise<void> {
  if (signingOut || typeof window === 'undefined') return;
  signingOut = true;

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

    if (getApiError(error)?.code === ERROR_CODES.DEVICE_MISMATCH) {
      await forceReLogin();
      throw error;
    }

    request._retried = true;

    try {
      await refreshSession();
    } catch {
      throw error;
    }

    return api(request);
  }
);

export function getApiError(error: unknown): ApiErrorBody['error'] | null {
  if (!isAxiosError(error)) return null;
  const body: unknown = error.response?.data;
  return isApiErrorBody(body) ? body.error : null;
}

export function getApiErrorMessage(error: unknown): string {
  return getApiError(error)?.message ?? 'به سرور وصل نشد. اتصالت به شبکهٔ دانشگاه رو چک کن.';
}

export function getApiFieldIssues(error: unknown): FieldIssue[] {
  return getApiError(error)?.details ?? [];
}

export { FA_ERROR_MESSAGES };
