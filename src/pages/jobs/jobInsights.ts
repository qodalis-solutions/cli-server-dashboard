import type { JobDto, JobRunDto } from '../../types';

/** What a run ended as, whatever the server calls it. */
export type Outcome = 'succeeded' | 'failed' | 'cancelled' | 'running';

/** Bottom to top in a stacked column, and the order of the legend. */
export const OUTCOMES: readonly Outcome[] = ['succeeded', 'failed', 'cancelled', 'running'];

export function outcomeOf(status: string): Outcome {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'succeeded':
    case 'success':
      return 'succeeded';
    case 'failed':
    case 'error':
    case 'timed_out':
    case 'timedout':
      return 'failed';
    case 'running':
    case 'pending':
    case 'retrying':
      return 'running';
    default:
      return 'cancelled';
  }
}

/** The theme color of each outcome (status colors: they carry state, and every chart has a legend). */
export const OUTCOME_COLORS: Record<Outcome, string> = {
  succeeded: 'var(--qcli-success)',
  failed: 'var(--qcli-error)',
  cancelled: 'var(--qcli-subtle)',
  running: 'var(--qcli-info)',
};

/** Status filter of the jobs list: what the job is doing now, or how its last run ended. */
export type JobStatusFilter = 'all' | 'active' | 'running' | 'paused' | 'stopped' | 'failing';
export const JOB_STATUS_FILTERS: readonly JobStatusFilter[] = ['all', 'active', 'running', 'paused', 'stopped', 'failing'];

export interface JobFilters {
  search: string;
  status: JobStatusFilter;
  group: string;
}

export function matchesJobStatus(job: JobDto, status: JobStatusFilter): boolean {
  switch (status) {
    case 'all':
      return true;
    case 'active':
      return job.status === 'active' || job.status === 'scheduled' || job.status === 'running';
    case 'running':
      return job.status === 'running' || !!job.currentExecutionId;
    case 'failing':
      return !!job.lastRunStatus && outcomeOf(job.lastRunStatus) === 'failed';
    default:
      return job.status === status;
  }
}

/** Jobs whose name, id, description or group contain the search (any case), with the status and group asked for. */
export function filterJobs(jobs: JobDto[], filters: JobFilters): JobDto[] {
  const search = filters.search.trim().toLowerCase();
  return jobs.filter(job =>
    matchesJobStatus(job, filters.status)
    && (!filters.group || (job.group ?? '') === filters.group)
    && (!search || [job.name, job.id, job.description, job.group].some(v => v?.toLowerCase().includes(search))),
  );
}

/** Groups of the jobs, sorted, without blanks. */
export function jobGroups(jobs: JobDto[]): string[] {
  return [...new Set(jobs.map(j => j.group).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function countByStatus(jobs: JobDto[]): Record<JobStatusFilter, number> {
  return Object.fromEntries(JOB_STATUS_FILTERS.map(s => [s, jobs.filter(j => matchesJobStatus(j, s)).length])) as Record<JobStatusFilter, number>;
}

export interface RunStats {
  total: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  running: number;
  /** Succeeded out of the finished runs that succeeded or failed; null without any. */
  successRate: number | null;
  /** Milliseconds, over finished runs with a duration; null without any. */
  avgDuration: number | null;
  p95Duration: number | null;
  maxDuration: number | null;
}

/** The value below which `p` (0..1) of the sorted values fall (nearest rank). */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function runStats(runs: Pick<JobRunDto, 'status' | 'duration'>[]): RunStats {
  const counts: Record<Outcome, number> = { succeeded: 0, failed: 0, cancelled: 0, running: 0 };
  const durations: number[] = [];
  for (const run of runs) {
    const outcome = outcomeOf(run.status);
    counts[outcome]++;
    if (outcome !== 'running' && typeof run.duration === 'number' && Number.isFinite(run.duration)) durations.push(run.duration);
  }
  durations.sort((a, b) => a - b);
  const decided = counts.succeeded + counts.failed;
  return {
    total: runs.length,
    ...counts,
    successRate: decided > 0 ? counts.succeeded / decided : null,
    avgDuration: durations.length ? durations.reduce((sum, d) => sum + d, 0) / durations.length : null,
    p95Duration: percentile(durations, 0.95),
    maxDuration: durations.length ? durations[durations.length - 1] : null,
  };
}

/** Runs of each job (newest first, as listed). */
export function runsByJob(runs: JobRunDto[]): Map<string, JobRunDto[]> {
  const byJob = new Map<string, JobRunDto[]>();
  for (const run of runs) {
    const list = byJob.get(run.jobId);
    if (list) list.push(run);
    else byJob.set(run.jobId, [run]);
  }
  return byJob;
}

/** Time ranges of the jobs page. */
export type RunRange = '1h' | '24h' | '7d';
export const RUN_RANGES: readonly RunRange[] = ['1h', '24h', '7d'];

const HOUR = 3_600_000;
/** Length and number of columns of each range: 5 minutes, an hour, 6 hours. */
export const RANGE_SPEC: Record<RunRange, { span: number; buckets: number }> = {
  '1h': { span: HOUR, buckets: 12 },
  '24h': { span: 24 * HOUR, buckets: 24 },
  '7d': { span: 7 * 24 * HOUR, buckets: 28 },
};

export interface RunBucket {
  /** Start and end of the column (ms since the epoch). */
  start: number;
  end: number;
  counts: Record<Outcome, number>;
  total: number;
}

/**
 * The range cut into equal columns, the last one holding `now` (aligned to the column size, so they do not shift on every
 * refresh), with each run counted in the column it started in. Runs outside the range are left out.
 */
export function bucketRuns(runs: Pick<JobRunDto, 'status' | 'startedAt'>[], range: RunRange, now: number): RunBucket[] {
  const { span, buckets: count } = RANGE_SPEC[range];
  const size = span / count;
  const end = rangeEnd(now, size);
  const start = end - span;
  const buckets: RunBucket[] = Array.from({ length: count }, (_, i) => ({
    start: start + i * size,
    end: start + (i + 1) * size,
    counts: { succeeded: 0, failed: 0, cancelled: 0, running: 0 },
    total: 0,
  }));
  for (const run of runs) {
    const time = Date.parse(run.startedAt);
    if (!Number.isFinite(time) || time < start || time >= end) continue;
    const bucket = buckets[Math.floor((time - start) / size)];
    bucket.counts[outcomeOf(run.status)]++;
    bucket.total++;
  }
  return buckets;
}

/** Start of the range (ISO 8601), for the server's `since`. */
export function rangeSince(range: RunRange, now: number): string {
  const { span, buckets } = RANGE_SPEC[range];
  const size = span / buckets;
  return new Date(rangeEnd(now, size) - span).toISOString();
}

/** End of the column `now` falls in (after `now`, even on a column edge). */
function rangeEnd(now: number, size: number): number {
  return (Math.floor(now / size) + 1) * size;
}

/** A duration in milliseconds as short text: 850ms, 2.4s, 3m 20s, 1h 5m. */
export function shortDuration(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
}
