'use client';

import type { UserDto } from '@repo/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { sessionQueryKey } from '@/hooks/use-auth';

function useProfileMutation<TArgs>(request: (args: TArgs) => Promise<UserDto>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: request,
    // The avatar shows up in the header, every roster and every bubble, so the
    // session is refetched rather than patched in one place.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
  });
}

export function useSetAvatar() {
  return useProfileMutation(async (file: File) => {
    const body = new FormData();
    body.append('avatar', file);

    // `Content-Type: null` clears the client's JSON default so the browser sets
    // `multipart/form-data` *with its boundary*. Without this the server gets a
    // body it cannot split and answers "incorrect MIME type/boundary".
    return (await api.put<UserDto>('/users/me/avatar', body, { headers: { 'Content-Type': null } }))
      .data;
  });
}

export function useClearAvatar() {
  return useProfileMutation(async () => (await api.delete<UserDto>('/users/me/avatar')).data);
}
