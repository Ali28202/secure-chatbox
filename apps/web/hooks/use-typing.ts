'use client';

import { TYPING_HEARTBEAT_MS } from '@repo/shared';
import { useCallback, useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';

export interface TypingAnnouncer {
  /** Call on every keystroke. Throttled — it does not emit per character. */
  announce: () => void;
  /** Call when the draft is sent or abandoned. */
  stop: () => void;
}

/**
 * The sending half of the typing indicator.
 *
 * A `typing:start` per keystroke would be a packet per character, so this
 * re-announces at most once per heartbeat and lets the receiver expire the
 * indicator on its own. `stop` is best-effort: if the tab dies instead, the
 * receiver's timeout is what clears it.
 */
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

  // Leaving the conversation counts as stopping, and so does swapping to a
  // different one — otherwise the previous chat keeps showing the indicator
  // until it expires.
  useEffect(() => stop, [stop]);

  return { announce, stop };
}
