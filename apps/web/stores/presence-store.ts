'use client';

import { create } from 'zustand';

interface PresenceState {
  /** User ids currently connected somewhere the viewer can see. */
  online: ReadonlySet<string>;
  /** Adds a batch without removing anyone — see `presence:sync` in the contract. */
  merge: (userIds: string[]) => void;
  set: (userId: string, isOnline: boolean) => void;
  clear: () => void;
}

/**
 * Who is online, as the socket last reported.
 *
 * A store rather than react-query state because presence is pushed, never
 * fetched: there is no endpoint to invalidate and nothing to refetch, so the
 * cache semantics react-query provides would all be dead weight.
 *
 * A `Set` in a store that components subscribe to has one requirement — every
 * update must produce a *new* Set. Mutating the existing one leaves the
 * reference unchanged, zustand's default equality check sees no change, and
 * nothing re-renders.
 */
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

/**
 * Subscribes a component to one user's presence.
 *
 * Selecting the boolean rather than the Set is what keeps a chat list of thirty
 * rows from re-rendering in full every time anybody anywhere connects — each
 * row only re-renders when its own answer changes.
 */
export function useIsOnline(userId: string | undefined): boolean {
  return usePresenceStore((state) => (userId ? state.online.has(userId) : false));
}
