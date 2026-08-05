'use client';

import { useEffect, useState } from 'react';

/**
 * Trails a value, settling only once it has stopped changing for `delay` ms.
 *
 * Used to keep the people picker from firing a request per keystroke: «محلاتی»
 * is six characters, and six queries to answer one question is five too many.
 * The input itself stays uncontrolled by this — typing is always instant; only
 * the query lags.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
