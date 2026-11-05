import { apiFetch } from './client';
import type { AuditEntryDto } from '../types';

export interface AuditQuery {
  event?: string;
  /** The user the events are about. */
  username?: string;
  /** The user who performed the actions. */
  actor?: string;
  /** Entries from this time on (ISO 8601; servers since 1.0.0-beta.19). */
  from?: string;
  /** Entries before this time. */
  to?: string;
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

/** Entries as CSV (RFC 4180), with a header row; properties as one JSON column. */
export function auditToCsv(entries: AuditEntryDto[]): string {
  const cell = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ['timestamp', 'event', 'actor', 'username', 'target', 'details', 'remoteAddress', 'properties'];
  const rows = entries.map(e => [
    new Date(e.timestamp).toISOString(), e.event, e.actor, e.username, e.target, e.details, e.metadata?.remoteAddress,
    e.properties && Object.keys(e.properties).length ? e.properties : '',
  ].map(cell).join(','));
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}
