'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Returns a debounced value that updates after `delayMs` of no changes.
 * Use for search/filter inputs to avoid lag: input updates immediately,
 * but expensive filter runs only after user stops typing.
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}

const DEBOUNCE_DELAY = 280;

export const SEARCH_DEBOUNCE_MS = DEBOUNCE_DELAY;
