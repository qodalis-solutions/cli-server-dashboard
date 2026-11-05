import { apiFetch } from './client';
import type { JobDto, JobExecutionDto, JobHistoryResponse } from '../types';

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

export interface JobHistoryParams {
  limit?: number;
  offset?: number;
}

export function getJobHistory(id: string, params: JobHistoryParams = {}): Promise<JobHistoryResponse> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiFetch<JobHistoryResponse>(`/api/v1/qcli/jobs/${encodeURIComponent(id)}/history${qs ? `?${qs}` : ''}`);
}

export function getJobExecution(id: string, execId: string): Promise<JobExecutionDto> {
  return apiFetch<JobExecutionDto>(`/api/v1/qcli/jobs/${encodeURIComponent(id)}/history/${execId}`);
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
