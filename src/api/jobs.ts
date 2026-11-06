import { ApiError, apiFetch } from './client';
import type { JobDto, JobExecutionDto, JobHistoryResponse, JobRunDto, JobRunsResponse, JobStatsResponse } from '../types';

export function getJobs(): Promise<JobDto[]> {
  return apiFetch<JobDto[]>('/api/v1/qcli/jobs');
}

export function getJob(id: string): Promise<JobDto> {
  return apiFetch<JobDto>(`/api/v1/qcli/jobs/${encodeURIComponent(id)}`);
}

export function triggerJob(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/qcli/jobs/${encodeURIComponent(id)}/trigger`, { method: 'POST' });
}

export function pauseJob(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/qcli/jobs/${encodeURIComponent(id)}/pause`, { method: 'POST' });
}

export function resumeJob(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/qcli/jobs/${encodeURIComponent(id)}/resume`, { method: 'POST' });
}

export function stopJob(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/qcli/jobs/${encodeURIComponent(id)}/stop`, { method: 'POST' });
}

export function cancelJob(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/qcli/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

/** Fields of `PUT /jobs/{id}`; intervals and timeouts as durations such as "30s" or "5m". */
export interface JobUpdate {
  description?: string;
  group?: string;
  /** Cron expression; replaces the interval. */
  schedule?: string;
  /** Replaces the schedule. */
  interval?: string;
  maxRetries?: number;
  timeout?: string;
  overlapPolicy?: string;
}

export function updateJob(id: string, update: JobUpdate): Promise<void> {
  return apiFetch<void>(`/api/v1/qcli/jobs/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(update) });
}

export interface JobStatsParams {
  since: string;
  until?: string;
  buckets?: number;
  jobs?: string[];
  group?: string;
}

/** Run statistics of a range counted by the server over every run (servers since 1.0.0-beta.19). */
export function getJobStats(params: JobStatsParams): Promise<JobStatsResponse> {
  const query = new URLSearchParams({ since: params.since });
  if (params.until) query.set('until', params.until);
  if (params.buckets !== undefined) query.set('buckets', String(params.buckets));
  if (params.jobs?.length) query.set('job', params.jobs.join(','));
  if (params.group) query.set('group', params.group);
  return apiFetch<JobStatsResponse>(`/api/v1/qcli/jobs/stats?${query}`);
}

export interface JobHistoryParams {
  limit?: number;
  offset?: number;
  /** Only runs with this status (e.g. `failed`). */
  status?: string;
}

export function getJobHistory(id: string, params: JobHistoryParams = {}): Promise<JobHistoryResponse> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.status) query.set('status', params.status);
  const qs = query.toString();
  return apiFetch<JobHistoryResponse>(`/api/v1/qcli/jobs/${encodeURIComponent(id)}/history${qs ? `?${qs}` : ''}`);
}

export function getJobExecution(id: string, execId: string): Promise<JobExecutionDto> {
  return apiFetch<JobExecutionDto>(`/api/v1/qcli/jobs/${encodeURIComponent(id)}/history/${execId}`);
}

/** Deletes a finished run and its logs (servers since 1.0.0-beta.21; 409 while it runs). */
export function deleteJobRun(id: string, execId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/qcli/jobs/${encodeURIComponent(id)}/history/${encodeURIComponent(execId)}`, { method: 'DELETE' });
}

/** Deletes the job's finished runs, or only those with `status`; running runs are kept. */
export function deleteJobRuns(id: string, status?: string): Promise<{ deleted: number }> {
  const qs = status ? `?${new URLSearchParams({ status })}` : '';
  return apiFetch<{ deleted: number }>(`/api/v1/qcli/jobs/${encodeURIComponent(id)}/history${qs}`, { method: 'DELETE' });
}

export interface JobRunsParams {
  /** Only these jobs. */
  jobs?: string[];
  group?: string;
  status?: string;
  /** Only runs started since this time (ISO 8601). */
  since?: string;
  limit?: number;
  offset?: number;
}

/** Runs across jobs, newest first (`GET /jobs/executions`, servers since 1.0.0-beta.15). */
export function getJobRuns(params: JobRunsParams = {}): Promise<JobRunsResponse> {
  const query = new URLSearchParams();
  if (params.jobs?.length) query.set('job', params.jobs.join(','));
  if (params.group) query.set('group', params.group);
  if (params.status) query.set('status', params.status);
  if (params.since) query.set('since', params.since);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiFetch<JobRunsResponse>(`/api/v1/qcli/jobs/executions${qs ? `?${qs}` : ''}`);
}

/** The servers return at most this many runs per request. */
export const RUNS_PAGE_SIZE = 100;

export interface RecentRuns {
  runs: JobRunDto[];
  /** Runs the server has for the query; more than `runs.length` when `max` cut the list. */
  total: number;
}

/**
 * The newest runs for the query, page by page, at most `max` of them: enough to chart a range without asking the
 * server for every run of a busy scheduler.
 */
export async function getRecentRuns(params: Omit<JobRunsParams, 'limit' | 'offset'>, max = 1000): Promise<RecentRuns> {
  const runs: JobRunDto[] = [];
  let total = 0;
  while (runs.length < max) {
    const limit = Math.min(RUNS_PAGE_SIZE, max - runs.length);
    const page = await getJobRuns({ ...params, limit, offset: runs.length });
    if (!Array.isArray(page?.items)) throw new ApiError('Not a run list', 404);
    total = page.total;
    runs.push(...page.items);
    if (page.items.length < limit || runs.length >= total) break;
  }
  return { runs, total: Math.max(total, runs.length) };
}

/** Whether the job offers an action: servers whose jobs run elsewhere may offer only some (`actions`). */
export function offers(job: Pick<JobDto, 'actions'> | null | undefined, action: string): boolean {
  return !job?.actions || job.actions.includes(action);
}

/**
 * A job's interval or timeout as a short duration: servers send milliseconds (.NET) or a duration string such as
 * "30s" (Node, Python), which is shown as it is.
 */
export function formatSpan(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value) || value < 0) return null;
  const units: [number, string][] = [[86_400_000, 'd'], [3_600_000, 'h'], [60_000, 'm'], [1000, 's']];
  for (const [size, unit] of units) {
    if (value >= size && value % size === 0) return `${value / size}${unit}`;
  }
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}
