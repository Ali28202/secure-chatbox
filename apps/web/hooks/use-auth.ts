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

const sessionQueryOptions = {
  queryKey: sessionQueryKey,
  queryFn: fetchSession,
  retry: false,
  staleTime: Infinity,
} as const;

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

export const SessionContext = createContext<UserDto | null>(null);

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
    mutationFn: async (input: LoginFormValues) =>
      (await api.post<UserDto>('/auth/login', { ...input, deviceId: getDeviceId() })).data,
    onSuccess: (user) => {
      queryClient.setQueryData(sessionQueryKey, user);
      setUser(user);
    },
  });
}

/**
 * Registers, and stops there.
 *
 * It used to sign the new account straight in. It cannot any more: an account
 * begins as PENDING, so the login that followed would come back 403 and the
 * form would report a failure for a registration that actually succeeded.
 */
export function useRegister() {
  return useMutation({
    mutationFn: async (input: RegisterInput) =>
      (await api.post<UserDto>('/auth/register', input)).data,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const router = useRouter();

  return useMutation({
    mutationFn: () => api.post('/auth/logout', {}),
    onSettled: () => {
      setUser(null);
      queryClient.clear();
      router.replace(ROUTES.login);
    },
  });
}
