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

export function useRegister() {
  const login = useLogin();

  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      await api.post<UserDto>('/auth/register', input);
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
    onSettled: () => {
      setUser(null);
      queryClient.clear();
      router.replace(ROUTES.login);
    },
  });
}
