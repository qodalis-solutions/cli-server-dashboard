import { apiFetch } from './client';
import type { AuditEntryDto } from '../types';

export interface AuditQuery {
  event?: string;
  /** The user the events are about. */
  username?: string;
  /** The user who performed the actions. */
  actor?: string;
  limit?: number;
  offset?: number;
}

/** The audit log of the users plugin, newest first (`audit:read`). */
export function getAudit(query: AuditQuery = {}): Promise<AuditEntryDto[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value).trim());
  }
  const qs = params.toString();
  return apiFetch<AuditEntryDto[]>(`/api/v1/qcli/audit${qs ? `?${qs}` : ''}`);
}

/** A property bag as short `key=value` pairs (objects as JSON). */
export function formatProperties(properties: Record<string, unknown> | null | undefined): string[] {
  if (!properties) return [];
  return Object.entries(properties).map(([key, value]) =>
    `${key}=${value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value)}`,
  );
}
