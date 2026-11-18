import { useCallback, useState } from 'react';

/** The stored value of `key`, or null when there is none or storage is unavailable (private mode, blocked). */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Stores the value; does nothing when storage is unavailable. */
export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Kept for this visit only
  }
}

/**
 * State remembered per viewer in localStorage: `parse` turns the stored text into a value (null: ignore it and use
 * `fallback`), `String(value)` is what is stored.
 */
export function useStoredState<T extends string | number | boolean>(key: string, parse: (stored: string) => T | null, fallback: () => T) {
  const [value, setValue] = useState<T>(() => {
    const stored = readStored(key);
    return (stored !== null ? parse(stored) : null) ?? fallback();
  });
  const set = useCallback((next: T) => {
    setValue(next);
    writeStored(key, String(next));
  }, [key]);
  return [value, set] as const;
}
