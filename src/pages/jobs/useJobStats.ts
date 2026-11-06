import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { getJobStats } from '../../api/jobs';
import { useLiveReload } from '../../hooks/useLiveReload';
import { RANGE_SPEC, insightsFromRuns, insightsFromStats, rangeSince, rangeUntil, type JobInsights, type RunRange } from './jobInsights';

export type JobStatsState =
  | { state: 'loading' }
  /** The server has no statistics endpoint (before 1.0.0-beta.19): count loaded runs instead. */
  | { state: 'unavailable' }
  | { state: 'error'; message: string }
  | { state: 'ready'; insights: JobInsights };

/** Typing in the search asks once it pauses. */
const FILTER_DELAY = 300;

/**
 * The server's run statistics for the range, of the given jobs (all of them when `jobs` is null), reloaded when the
 * range or jobs change and shortly after any job event. While reloading, the previous numbers stay. Nothing is
 * asked while `enabled` is false.
 */
export function useJobStats(range: RunRange, jobs: string[] | null, enabled = true) {
  const [result, setResult] = useState<JobStatsState>({ state: 'loading' });
  const [reloading, setReloading] = useState(false);
  const request = useRef(0);
  const jobsKey = jobs ? jobs.join(',') : null;

  const load = useCallback(async () => {
    if (!enabled) return;
    const current = ++request.current;
    const now = Date.now();
    if (jobsKey === '') {
      // No job matches the filters: nothing to ask
      setResult({ state: 'ready', insights: insightsFromRuns([], range, now) });
      return;
    }
    setReloading(true);
    try {
      const response = await getJobStats({
        since: rangeSince(range, now),
        until: rangeUntil(range, now),
        buckets: RANGE_SPEC[range].buckets,
        jobs: jobsKey?.split(','),
      });
      if (current !== request.current) return;
      if (Array.isArray(response?.buckets) && Array.isArray(response.jobs) && response.totals) {
        setResult({ state: 'ready', insights: insightsFromStats(response) });
      } else {
        setResult({ state: 'unavailable' });
      }
    } catch (err) {
      if (current !== request.current) return;
      if (err instanceof ApiError && (err.status === 404 || err.status === 501)) setResult({ state: 'unavailable' });
      else setResult({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      if (current === request.current) setReloading(false);
    }
  }, [range, jobsKey, enabled]);

  useEffect(() => {
    const timer = setTimeout(load, FILTER_DELAY);
    return () => clearTimeout(timer);
  }, [load]);

  // Any job event (a run started or ended, runs deleted, a job changed) can change what is shown
  useLiveReload('job:*', () => void load());

  return { ...result, reloading, reload: load } as JobStatsState & { reloading: boolean; reload: () => Promise<void> };
}
