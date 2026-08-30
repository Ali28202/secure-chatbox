'use client';

import { create } from 'zustand';

interface PresenceState {
  online: ReadonlySet<string>;
  merge: (userIds: string[]) => void;
  set: (userId: string, isOnline: boolean) => void;
  clear: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  online: new Set<string>(),

  merge: (userIds) =>
    set((state) => {
      if (userIds.every((id) => state.online.has(id))) return state;
      return { online: new Set([...state.online, ...userIds]) };
    }),

  set: (userId, isOnline) =>
    set((state) => {
      if (state.online.has(userId) === isOnline) return state;

      const online = new Set(state.online);
      if (isOnline) online.add(userId);
      else online.delete(userId);
      return { online };
    }),

  clear: () => set({ online: new Set<string>() }),
}));

export function useIsOnline(userId: string | undefined): boolean {
  return usePresenceStore((state) => (userId ? state.online.has(userId) : false));
}
