'use client';

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

/** `chatId` -> the ids announcing that they are typing in it. */
type TypingMap = ReadonlyMap<string, ReadonlySet<string>>;

interface TypingState {
  typing: TypingMap;
  set: (chatId: string, userId: string, isTyping: boolean) => void;
  clear: () => void;
}

export const useTypingStore = create<TypingState>((set) => ({
  typing: new Map(),

  set: (chatId, userId, isTyping) =>
    set((state) => {
      const inChat = state.typing.get(chatId);
      if (inChat?.has(userId) === isTyping) return state;

      const typing = new Map(state.typing);
      const next = new Set(inChat ?? []);

      if (isTyping) next.add(userId);
      else next.delete(userId);

      if (next.size === 0) typing.delete(chatId);
      else typing.set(chatId, next);

      return { typing };
    }),

  clear: () => set({ typing: new Map() }),
}));

/**
 * Who is typing in a chat, the viewer excluded.
 *
 * The store holds no expiry and the selector reads no clock: a selector that
 * returned a different answer for the same state would re-render forever.
 * Expiry is a timer in `RealtimeBridge`, which is also the only place that can
 * cancel it on unmount.
 */
export function useTypingUserIds(chatId: string | undefined, viewerId: string): string[] {
  return useTypingStore(
    useShallow((state) => {
      if (!chatId) return [];

      const inChat = state.typing.get(chatId);
      if (!inChat) return [];

      return [...inChat].filter((userId) => userId !== viewerId);
    })
  );
}
