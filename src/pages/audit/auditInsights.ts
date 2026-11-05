import type { AuditEntryDto } from '../../types';

/** What kind of event an entry is, by its name: it picks the badge and the chart color. */
export type AuditKind = 'failure' | 'removal' | 'access' | 'other';
/** Bottom to top in the chart; the order of the legend. */
export const AUDIT_KINDS: readonly AuditKind[] = ['failure', 'removal', 'access', 'other'];

export function auditKind(event: string): AuditKind {
  if (/fail|denied|locked|revoked/i.test(event)) return 'failure';
  if (/delete|remove|disable|clear/i.test(event)) return 'removal';
  if (/create|add|login|open/i.test(event)) return 'access';
  return 'other';
}

export const AUDIT_KIND_COLORS: Record<AuditKind, string> = {
  failure: 'var(--qcli-error)',
  removal: 'var(--qcli-warning)',
  access: 'var(--qcli-info)',
  other: 'var(--qcli-subtle)',
};

export type AuditRange = '24h' | '7d' | '30d' | 'all';
export const AUDIT_RANGES: readonly AuditRange[] = ['24h', '7d', '30d', 'all'];

const HOUR = 3_600_000;
const RANGE_SPEC: Record<Exclude<AuditRange, 'all'>, { span: number; buckets: number }> = {
  '24h': { span: 24 * HOUR, buckets: 24 },
  '7d': { span: 7 * 24 * HOUR, buckets: 28 },
  '30d': { span: 30 * 24 * HOUR, buckets: 30 },
};

/** Start of the range (ms), or null for all time. */
export function auditRangeStart(range: AuditRange, now: number): number | null {
  return range === 'all' ? null : now - RANGE_SPEC[range].span;
}

export interface AuditBucket {
  start: number;
  end: number;
  counts: Record<AuditKind, number>;
  total: number;
}

/**
 * Entries per column over the range, by kind. `all` spans the entries' own first to last time in 30 columns; the
 * last column always ends after `now` (or the newest entry).
 */
export function bucketAudit(entries: Pick<AuditEntryDto, 'timestamp' | 'event'>[], range: AuditRange, now: number): AuditBucket[] {
  let start: number;
  let size: number;
  let count: number;
  if (range === 'all') {
    if (entries.length === 0) return [];
    const times = entries.map(e => e.timestamp);
    const first = Math.min(...times);
    const last = Math.max(...times);
    count = 30;
    size = Math.max(60_000, Math.ceil((last - first + 1) / count));
    start = first;
  } else {
    ({ buckets: count } = RANGE_SPEC[range]);
    size = RANGE_SPEC[range].span / count;
    const end = (Math.floor(now / size) + 1) * size;
    start = end - count * size;
  }
  const buckets: AuditBucket[] = Array.from({ length: count }, (_, i) => ({
    start: start + i * size,
    end: start + (i + 1) * size,
    counts: { failure: 0, removal: 0, access: 0, other: 0 },
    total: 0,
  }));
  for (const entry of entries) {
    const index = Math.floor((entry.timestamp - start) / size);
    if (index < 0 || index >= count) continue;
    buckets[index].counts[auditKind(entry.event)]++;
    buckets[index].total++;
  }
  return buckets;
}

/** The most frequent values of a field, most first (then by name), blanks left out. */
export function topValues(entries: AuditEntryDto[], field: (entry: AuditEntryDto) => string | undefined, limit = 5): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const value = field(entry);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

/** Whether an entry contains the text (any case) in its event, users, target, details or values. */
export function matchesAuditText(entry: AuditEntryDto, text: string): boolean {
  const search = text.trim().toLowerCase();
  if (!search) return true;
  return [entry.event, entry.actor, entry.username, entry.target, entry.details, entry.metadata?.remoteAddress,
    entry.properties ? JSON.stringify(entry.properties) : undefined]
    .some(value => value?.toLowerCase().includes(search));
}
