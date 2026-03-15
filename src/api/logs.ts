import { apiFetch } from './client';
import type { LogsResponse } from '../types';

export interface LogsParams {
  level?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export function getLogs(params: LogsParams = {}): Promise<LogsResponse> {
  const query = new URLSearchParams();
  if (params.level) query.set('level', params.level);
  if (params.search) query.set('search', params.search);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiFetch<LogsResponse>(`/api/v1/qcli/logs${qs ? `?${qs}` : ''}`);
}
