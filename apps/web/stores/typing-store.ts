'use client';

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

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
