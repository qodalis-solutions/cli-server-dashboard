import { useCallback, useSyncExternalStore } from 'react';

/** Whether the media query matches, following changes; `fallback` where the browser cannot tell (no matchMedia). */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback((notify: () => void) => {
    if (typeof window.matchMedia !== 'function') return () => {};
    const list = window.matchMedia(query);
    list.addEventListener?.('change', notify);
    return () => list.removeEventListener?.('change', notify);
  }, [query]);
  const read = () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback);
  return useSyncExternalStore(subscribe, read, () => fallback);
}

/** From Tailwind's `lg` up the sidebar is always shown; below it the navigation is a drawer. */
export const DESKTOP_NAV_QUERY = '(min-width: 1024px)';
