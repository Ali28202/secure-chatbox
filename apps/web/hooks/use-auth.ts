'use client';

import type { LoginFormValues, RegisterInput, UserDto } from '@repo/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect } from 'react';
import { api } from '@/lib/api';
import { getDeviceId } from '@/lib/device-id';
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
 * The session the authenticated layout has already verified, handed down.
 *
 * Provided by `AppLayout` and by nothing else. That is the whole design: the
 * layout is the component that waits for `/auth/me` to answer, so it is the one
 * that can honestly say a session exists, and passing its own proof downwards
 * is what makes `useCurrentUser` safe to write without a null check.
 *
 * Deliberately not the auth store, which is filled by an effect and is
 * therefore still empty during the first render the layout admits. And
 * deliberately not a second `useQuery` on the session key, which is what this
 * used to be — see `useCurrentUser` for what that cost.
 */
export const SessionContext = createContext<UserDto | null>(null);

/**
 * The current user, for components that only ever render inside the
 * authenticated layout.
 *
 * Reads the context rather than the session query, and the difference is not
 * cosmetic. Both give the same value in the steady state, but a `useQuery` here
 * creates a *second observer* on that key, and React makes no promise that a
 * parent re-renders before a child that has its own pending update. `AppHeader`
 * owns the logout mutation and also calls this hook: when logout cleared the
 * cache, the mutation notified the header, the header re-rendered alone, and
 * this threw — while the layout, whose gate would have unmounted it, had not
 * re-rendered yet. Reading the context cannot fail that way, because the value
 * only changes when the layout itself renders, which *is* the gate.
 *
 * The store stays as the mirror for code that lives outside React and cannot
 * call a hook at all (the socket client).
 *
 * Throwing rather than returning `null` keeps every consumer from writing a
 * `user?.` chain for a case that cannot happen — and now the message is
 * accurate: with the context in place, the only way to reach it really is to
 * call this from outside the layout.
 */
export function useCurrentUser(): UserDto {
  const user = useContext(SessionContext);
  if (!user) {
    throw new Error('useCurrentUser was called outside the authenticated layout.');
  }
  return user;
}

export function useLogin() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);

  return useMutation({
    // The device is attached here rather than being a form field, because it is
    // not something anybody types — the form collects credentials, and this is
    // the one place that knows a login is what carries a device with it.
    // Reading it inside `mutationFn` also keeps `localStorage` off the server:
    // this file is a client module, but the hook itself still renders during
    // SSR, and a call at that level would be evaluated there.
    mutationFn: async (input: LoginFormValues) =>
      (await api.post<UserDto>('/auth/login', { ...input, deviceId: getDeviceId() })).data,
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
      // Signs in by university id, though the account now has two identifiers.
      // Either would work; this one is the field the person just filled in and
      // is not reformatted on its way to the server.
      return login.mutateAsync({
        identifier: input.universityId,
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
