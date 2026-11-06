import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { getRecentRuns, type JobRunsParams } from '../../api/jobs';
import { useLiveReload } from '../../hooks/useLiveReload';
import type { JobRunDto } from '../../types';
import { rangeSince, type RunRange } from './jobInsights';

export type JobRunsState =
  | { state: 'loading' }
  /** The server has no cross-job run list (before 1.0.0-beta.15) or its store cannot query runs. */
  | { state: 'unavailable' }
  | { state: 'error'; message: string }
  /** `loadedAt`: the time the range was measured from (ms since the epoch). */
  | { state: 'ready'; runs: JobRunDto[]; total: number; loadedAt: number };

/**
 * The newest runs of the `range` (all of them without one), reloaded when the query changes, on `reload()`, and
 * shortly after any job event. While reloading, the previous runs stay (`reloading`), so
 * charts keep their frame. `params` null loads nothing.
 */
export function useJobRuns(params: Omit<JobRunsParams, 'since' | 'limit' | 'offset'> | null, range: RunRange | null, max = 1000) {
  const [result, setResult] = useState<JobRunsState>({ state: 'loading' });
  const [reloading, setReloading] = useState(false);
  const request = useRef(0);
  const key = params ? JSON.stringify(params) : null;

  const load = useCallback(async () => {
    if (key === null) return;
    const current = ++request.current;
    setReloading(true);
    try {
      const now = Date.now();
      const since = range ? rangeSince(range, now) : undefined;
      const { runs, total } = await getRecentRuns({ ...JSON.parse(key), since }, max);
      if (current === request.current) setResult({ state: 'ready', runs, total, loadedAt: now });
    } catch (err) {
      if (current !== request.current) return;
      if (err instanceof ApiError && (err.status === 404 || err.status === 501)) setResult({ state: 'unavailable' });
      else setResult({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      if (current === request.current) setReloading(false);
    }
  }, [key, range, max]);

  useEffect(() => {
    // The fetch settles after this effect; state is only set from its callbacks
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Any job event (a run started or ended, runs deleted, a job changed) can change what is shown
  useLiveReload('job:*', () => void load());

  return { ...result, reloading, reload: load } as JobRunsState & { reloading: boolean; reload: () => Promise<void> };
}
