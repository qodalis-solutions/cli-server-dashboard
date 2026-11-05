import { apiFetch } from './client';
import type { LogHistogramResponse, LogsResponse } from '../types';

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

function logQuery(params: LogsParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.level) query.set('level', params.level);
  const search = params.search?.trim();
  if (search) query.set('search', search);
  if (params.service) query.set('service', params.service);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  return query;
}

export function getLogs(params: LogsParams = {}): Promise<LogsResponse> {
  const qs = logQuery(params).toString();
  return apiFetch<LogsResponse>(`/api/v1/qcli/logs${qs ? `?${qs}` : ''}`);
}

/** Entries per level and column of a time range, with the logs' filters (servers since 1.0.0-beta.19). */
export function getLogHistogram(params: Omit<LogsParams, 'limit' | 'offset'> & { buckets?: number }): Promise<LogHistogramResponse> {
  const query = logQuery(params);
  if (params.buckets !== undefined) query.set('buckets', String(params.buckets));
  const qs = query.toString();
  return apiFetch<LogHistogramResponse>(`/api/v1/qcli/logs/histogram${qs ? `?${qs}` : ''}`);
}
