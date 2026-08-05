import type { UserDto } from '@repo/shared';
import { create } from 'zustand';

/**
 * `unknown` is not the same as `anonymous`: on first paint we have not asked
 * the API yet, and rendering "signed out" during that gap makes the shell
 * flicker for someone who is perfectly signed in.
 */
export type SessionStatus = 'unknown' | 'authenticated' | 'anonymous';

interface AuthState {
  user: UserDto | null;
  status: SessionStatus;
  setUser: (user: UserDto | null) => void;
}

/**
 * The signed-in user, held outside the React tree.
 *
 * `/auth/me` is fetched by react-query (see `hooks/use-auth.ts`), which owns
 * loading and error state; this store is where the resulting user lands so it
 * can be read *synchronously and from anywhere* — including code that is not a
 * component and has no hooks available, such as the socket client in M8, which
 * needs to know whose message just arrived.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'unknown',
  setUser: (user) => set({ user, status: user ? 'authenticated' : 'anonymous' }),
}));

/** The current user for non-React callers. Returns `null` when signed out. */
export function getCurrentUser(): UserDto | null {
  return useAuthStore.getState().user;
}
