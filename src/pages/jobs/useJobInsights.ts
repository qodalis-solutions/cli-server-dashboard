import { useMemo } from 'react';
import { insightsFromRuns, type JobInsights, type RunRange } from './jobInsights';
import { useJobRuns } from './useJobRuns';
import { useJobStats } from './useJobStats';

const ALL_JOBS = {};

/**
 * Run statistics of every job for the range: the server's own (1.0.0-beta.19), or counted from up to `max` loaded
 * runs on older servers. Null while loading, when jobs are off (`enabled` false) or the server has neither.
 */
export function useJobInsights(range: RunRange, enabled: boolean, max = 500): { insights: JobInsights | null; reloading: boolean } {
  const stats = useJobStats(range, null, enabled);
  const fallback = enabled && stats.state === 'unavailable';
  const runs = useJobRuns(fallback ? ALL_JOBS : null, range, max);
  const fromRuns = useMemo(
    () => (fallback && runs.state === 'ready' ? insightsFromRuns(runs.runs, range, runs.loadedAt) : null),
    [fallback, runs, range],
  );
  if (stats.state === 'ready') return { insights: stats.insights, reloading: stats.reloading };
  return { insights: fromRuns, reloading: runs.reloading };
}
