'use client';

import type { LoginInput, RegisterInput, UserDto } from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { ROUTES } from '@/lib/routes';
import { useAuthStore } from '@/stores/auth-store';

export const sessionQueryKey = ['session'] as const;

async function fetchSession(): Promise<UserDto> {
  return (await api.get<UserDto>('/auth/me')).data;
}

/**
 * `retry: false` because the axios interceptor has already refreshed and
 * replayed by the time a 401 reaches us — a second attempt would ask the same
 * dead session the same question.
 *
 * `staleTime: Infinity` because nothing about the user changes without us doing
 * it: login, logout and refresh all write the new value into this cache
 * directly. Refetching on an interval would only add requests.
 */
const sessionQueryOptions = {
  queryKey: sessionQueryKey,
  queryFn: fetchSession,
  retry: false,
  staleTime: Infinity,
} as const;

/**
 * Loads the signed-in user and mirrors it into the auth store.
 *
 * Mounted once, by the authenticated layout, which blocks its children until
 * this resolves.
 */
export function useSession() {
  const setUser = useAuthStore((state) => state.setUser);

  const query = useQuery(sessionQueryOptions);

  const { data, isSuccess, isError } = query;

  useEffect(() => {
    if (isSuccess) setUser(data);
    else if (isError) setUser(null);
  }, [isSuccess, isError, data, setUser]);

  return query;
}

/**
 * The current user for components that are only ever rendered inside the
 * authenticated layout, where the session is guaranteed to be loaded.
 *
 * Reads the query cache rather than the auth store, and that distinction
 * matters: the store is filled by an effect, which React runs *after* the
 * render it belongs to. On a hard page load the layout would see `isSuccess`
 * and render this component's parent in the same pass that the store was still
 * empty, and every consumer would throw. The cache is already populated at that
 * point, so reading it is the only version that is correct on the first render.
 *
 * The shared query key means this costs no extra request — it subscribes to the
 * entry `useSession` created. The store stays as the mirror for code that lives
 * outside React and cannot call a hook at all (the socket client in M8).
 *
 * Throwing rather than returning `null` keeps every consumer from writing a
 * `user?.` chain for a case that cannot happen — and turns a mistake in the
 * routing into one loud error instead of a screen full of blanks.
 */
export function useCurrentUser(): UserDto {
  const { data } = useQuery(sessionQueryOptions);
  if (!data) {
    throw new Error('useCurrentUser was called outside the authenticated layout.');
  }
  return data;
}

export function useLogin() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    mutationFn: async (input: LoginInput) => (await api.post<UserDto>('/auth/login', input)).data,
    onSuccess: (user) => {
      // Seed the cache so the authenticated layout does not fire `/auth/me` for
      // a user the login response already gave us.
      queryClient.setQueryData(sessionQueryKey, user);
      setUser(user);
    },
  });
}

/**
 * Creates the account, then signs in with the same credentials.
 *
 * The API keeps registration and authentication separate on purpose — the one
 * endpoint that hands out a session is the one that checks a password — but
 * there is no reason to make a new user type their credentials twice, so the
 * client makes both calls.
 */
export function useRegister() {
  const login = useLogin();

  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      await api.post<UserDto>('/auth/register', input);
      return login.mutateAsync({
        universityId: input.universityId,
        password: input.password,
      });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const router = useRouter();

  return useMutation({
    mutationFn: () => api.post('/auth/logout', {}),
    // `onSettled`, not `onSuccess`: if the request fails because the network
    // dropped, the user still asked to be signed out and this browser should
    // stop showing their conversations. The cookies outlive it, but the next
    // request will 401 and land back here.
    onSettled: () => {
      setUser(null);
      // Not `invalidate` — `clear` drops every cached chat and message outright,
      // so the next person to sign in on this machine cannot see a flash of the
      // previous one's data while their own loads.
      queryClient.clear();
      router.replace(ROUTES.login);
    },
  });
}
