import { useCallback, useEffect, useRef, useState } from 'react';
import { getJobRuns, type JobRunsParams } from '../../api/jobs';
import { useLiveReload } from '../../hooks/useLiveReload';
import type { JobRunDto } from '../../types';
import { rangeSince, type RunRange } from './jobInsights';

export type RunsPageState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; items: JobRunDto[]; total: number };

/**
 * One page of the runs since the start of `range`, paged by the server, reloaded when the query or page changes and
 * shortly after any job event. The previous page stays while the next loads. `query` null loads nothing (`idle`).
 */
export function useRunsPage(query: Omit<JobRunsParams, 'since' | 'limit' | 'offset'> | null, range: RunRange, page: number, pageSize: number) {
  const [result, setResult] = useState<RunsPageState>({ state: 'idle' });
  const request = useRef(0);
  const key = query ? JSON.stringify(query) : null;

  const load = useCallback(async () => {
    const current = ++request.current;
    if (key === null) {
      setResult({ state: 'idle' });
      return;
    }
    setResult(prev => (prev.state === 'ready' ? prev : { state: 'loading' }));
    try {
      const since = rangeSince(range, Date.now());
      const { items, total } = await getJobRuns({ ...JSON.parse(key), since, limit: pageSize, offset: page * pageSize });
      if (current === request.current) setResult({ state: 'ready', items, total });
    } catch (err) {
      if (current === request.current) setResult({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [key, range, page, pageSize]);

  useEffect(() => {
    // The fetch settles after this effect; state is only set from its callbacks
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useLiveReload('job:*', () => { if (key !== null) void load(); });

  return { ...result, reload: load } as RunsPageState & { reload: () => Promise<void> };
}
