import { apiFetch } from './client';
import type { JobDto, JobExecutionDto, JobHistoryResponse } from '../types';

export function getJobs(): Promise<JobDto[]> {
  return apiFetch<JobDto[]>('/api/v1/qcli/jobs');
}

export function getJob(id: string): Promise<JobDto> {
  return apiFetch<JobDto>(`/api/v1/qcli/jobs/${id}`);
}

export function triggerJob(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/qcli/jobs/${id}/trigger`, { method: 'POST' });
}

export function pauseJob(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/qcli/jobs/${id}/pause`, { method: 'POST' });
}

export function resumeJob(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/qcli/jobs/${id}/resume`, { method: 'POST' });
}

export function stopJob(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/qcli/jobs/${id}/stop`, { method: 'POST' });
}

export function cancelJob(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/qcli/jobs/${id}/cancel`, { method: 'POST' });
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
  return apiFetch<JobHistoryResponse>(`/api/v1/qcli/jobs/${id}/history${qs ? `?${qs}` : ''}`);
}

export function getJobExecution(id: string, execId: string): Promise<JobExecutionDto> {
  return apiFetch<JobExecutionDto>(`/api/v1/qcli/jobs/${id}/history/${execId}`);
}
