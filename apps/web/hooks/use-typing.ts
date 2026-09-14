'use client';

import { TYPING_HEARTBEAT_MS } from '@repo/shared';
import { useCallback, useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';

export interface TypingAnnouncer {
  announce: () => void;
  stop: () => void;
}

export function useTypingAnnouncer(chatId: string): TypingAnnouncer {
  const lastSentAt = useRef(0);
  const isTyping = useRef(false);

  const stop = useCallback(() => {
    if (!isTyping.current) return;

    isTyping.current = false;
    lastSentAt.current = 0;
    getSocket().emit('typing:stop', chatId);
  }, [chatId]);

  const announce = useCallback(() => {
    const now = Date.now();
    if (now - lastSentAt.current < TYPING_HEARTBEAT_MS) return;

    lastSentAt.current = now;
    isTyping.current = true;
    getSocket().emit('typing:start', chatId);
  }, [chatId]);

  useEffect(() => stop, [stop]);

  return { announce, stop };
}
