import type { JobRunsParams } from '../../api/jobs';
import type { Outcome, RunRange } from './jobInsights';

/** The filters of the jobs page that are set (not their default): search, status, group, each tag and the range. */
export function activeFilterCount(filters: { search: string; status: string; group: string; tags: readonly string[]; range: RunRange }): number {
  return (filters.search.trim() ? 1 : 0)
    + (filters.status !== 'all' ? 1 : 0)
    + (filters.group ? 1 : 0)
    + filters.tags.length
    + (filters.range !== '24h' ? 1 : 0);
}

/** Whether the screen is wide enough to show the filters open by default (Tailwind's `sm`). */
export function wideScreen(): boolean {
  try {
    return typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 640px)').matches;
  } catch {
    return true;
  }
}

/** The views of the jobs page (`?tab=`): the jobs list, or the runs of the shown jobs. */
export const JOBS_TABS = ['jobs', 'runs'] as const;
export type JobsTab = (typeof JOBS_TABS)[number];

export function parseJobsTab(value: string | null): JobsTab {
  return JOBS_TABS.includes(value as JobsTab) ? value as JobsTab : 'jobs';
}

/** Run statuses the servers filter by, for each result filter. */
const OUTCOME_STATUS: Record<Outcome, string> = { succeeded: 'completed', failed: 'failed', cancelled: 'cancelled', running: 'running' };
/** Above this many jobs the run list is not asked for by job ids (the query would get too long). */
export const MAX_QUERY_JOBS = 50;

/**
 * The server query of the run list, paged by the server (`GET /jobs/executions` with limit and offset), or null
 * when the server cannot answer it and the loaded runs are paged in the page instead: a picked chart column (the
 * API has no end time), or filters matching more than `MAX_QUERY_JOBS` jobs (or none). `since` and the page are
 * added when loading.
 */
export function runsPageQuery(view: {
  filters: { search: string; status: string; group: string; tags: readonly string[] };
  /** Ids of the jobs the filters match. */
  jobIds: readonly string[];
  outcome: Outcome | null;
  windowPicked: boolean;
}): Omit<JobRunsParams, 'since' | 'limit' | 'offset'> | null {
  if (view.windowPicked) return null;
  const query: Omit<JobRunsParams, 'since' | 'limit' | 'offset'> = {};
  if (view.outcome) query.status = OUTCOME_STATUS[view.outcome];
  const { search, status, group, tags } = view.filters;
  if (!search.trim() && status === 'all' && tags.length === 0) {
    if (group) query.group = group;
    return query;
  }
  if (view.jobIds.length === 0 || view.jobIds.length > MAX_QUERY_JOBS) return null;
  query.jobs = [...view.jobIds];
  return query;
}
