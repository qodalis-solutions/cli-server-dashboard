import { apiFetch } from './client';
import type { LogsResponse } from '../types';

export interface LogsParams {
  /** One level or a comma list (`WARN,ERROR`). */
  level?: string;
  search?: string;
  service?: string;
  /** ISO 8601. */
  from?: string;
  /** ISO 8601. */
  to?: string;
  limit?: number;
  offset?: number;
}

export function getLogs(params: LogsParams = {}): Promise<LogsResponse> {
  const query = new URLSearchParams();
  if (params.level) query.set('level', params.level);
  const search = params.search?.trim();
  if (search) query.set('search', search);
  if (params.service) query.set('service', params.service);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiFetch<LogsResponse>(`/api/v1/qcli/logs${qs ? `?${qs}` : ''}`);
}
