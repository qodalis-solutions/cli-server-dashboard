import { useEffect, useRef } from 'react';
import { useWebSocket } from '../context/WebSocketContext';

export type ServerEvent = Record<string, unknown>;

/** Several events together cause one reload. */
export const LIVE_RELOAD_DELAY = 1500;

/**
 * For a job's own state (status, the runs going now): a run of a few hundred milliseconds must still show as running,
 * which a 1.5 s wait would miss. Bursts still make one reload.
 */
export const JOB_STATE_RELOAD_DELAY = 250;

/** Server event patterns: `*` matches every type, `ns:*` every type starting with `ns:`, anything else one type. */
export function matchesEventPattern(type: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) return type.startsWith(pattern.slice(0, -1));
  return type === pattern;
}

type TimerRef = { current: ReturnType<typeof setTimeout> | undefined };

/** (Re)starts the timer; it is cleared once it fired, so a set timer always means a reload is still to come. */
function schedule(timer: TimerRef, run: () => void, delay: number) {
  clearTimeout(timer.current);
  timer.current = setTimeout(() => {
    timer.current = undefined;
    run();
  }, delay);
}

export interface LiveReloadOptions {
  /** Only events it accepts cause a reload. */
  filter?: (event: ServerEvent) => boolean;
  /**
   * While true, events are only remembered (e.g. a form is open, or the user paged away from the newest entries);
   * the reload runs once it turns false.
   */
  paused?: boolean;
  delay?: number;
}

/**
 * Calls `reload` shortly after server events of the given types (`job:*`, `fs:changed`, …): a burst of events causes
 * one reload, `delay` ms after the last of them. `reload` and `filter` may change on every render.
 */
export function useLiveReload(patterns: string | readonly string[], reload: () => void, options: LiveReloadOptions = {}) {
  const { filter, paused = false, delay = LIVE_RELOAD_DELAY } = options;
  const { subscribe } = useWebSocket();
  const reloadRef = useRef(reload);
  const filterRef = useRef(filter);
  const pausedRef = useRef(paused);
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    reloadRef.current = reload;
    filterRef.current = filter;
  });

  const key = typeof patterns === 'string' ? patterns : patterns.join('\n');

  useEffect(() => {
    const onEvent = (event: ServerEvent) => {
      if (filterRef.current && !filterRef.current(event)) return;
      if (pausedRef.current) pendingRef.current = true;
      else schedule(timerRef, () => reloadRef.current(), delay);
    };
    // One handler for every pattern: an event matching two of them is still one reload
    const unsubscribers = key.split('\n').map(pattern => subscribe(pattern, onEvent));
    return () => {
      clearTimeout(timerRef.current);
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [key, delay, subscribe]);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      // A reload waiting to run would land in the paused state: keep it for later
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
        pendingRef.current = true;
      }
    } else if (pendingRef.current) {
      pendingRef.current = false;
      schedule(timerRef, () => reloadRef.current(), delay);
    }
  }, [paused, delay]);
}
