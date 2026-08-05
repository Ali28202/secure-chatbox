'use client';

import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

/**
 * "Are we past hydration?" as an external store rather than a `setMounted(true)`
 * in an effect — same answer, but React reads it during render instead of
 * scheduling a second pass, which is what `react-hooks/set-state-in-effect`
 * is asking for. The value never changes after mount, so `subscribe` has
 * nothing to notify and returns an unsubscribe that does nothing.
 */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // The server has no idea which theme this browser resolved to, so rendering
  // the real icon before hydration guarantees a mismatch.
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'نمایش روشن' : 'نمایش تیره'}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
