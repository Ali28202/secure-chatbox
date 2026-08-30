import type { UserDto } from '@repo/shared';
import { create } from 'zustand';

export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

interface AuthState {
  user: UserDto | null;
  status: SessionStatus;
  setUser: (user: UserDto | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'unknown',
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'anonymous' }),
}));

export function getCurrentUser(): UserDto | null {
  return useAuthStore.getState().user;
}
