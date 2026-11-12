import type { AuditEntryDto } from '../../types';

/** One labelled value of an entry, e.g. "Source: demo-sqlite". */
export interface AuditFact {
  label: 'source' | 'result' | 'duration' | 'terminal' | 'origin' | 'token';
  value: string;
  tone?: 'success' | 'error';
}

/** What a known event says, read from its metadata; null for events shown with their details only. */
export interface AuditEventDetails {
  facts: AuditFact[];
  /** The query of a `data_query` entry (the server cuts long ones). */
  query?: string;
  /** Why it failed or was refused. */
  error?: string;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : typeof value === 'number' ? String(value) : undefined;

const count = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * Details of the events the dashboard knows: data explorer queries (`data_query`: source, query, success, rowCount,
 * durationMs, error) and terminal links (`link_approved`: client, origin, tokenId; `link_denied`: client, origin).
 * `rows(n)` and `ms(n)` format the numbers in the reader's language.
 */
export function auditEventDetails(
  entry: Pick<AuditEntryDto, 'event' | 'metadata'>,
  format: { rows: (n: number) => string; ms: (n: number) => string; succeeded: string; failed: string },
): AuditEventDetails | null {
  const m = (entry.metadata ?? {}) as Record<string, unknown>;
  switch (entry.event) {
    case 'data_query': {
      const facts: AuditFact[] = [];
      const source = text(m.source);
      if (source) facts.push({ label: 'source', value: source });
      const rows = count(m.rowCount);
      if (m.success === true) facts.push({ label: 'result', value: rows !== undefined ? format.rows(rows) : format.succeeded, tone: 'success' });
      else if (m.success === false) facts.push({ label: 'result', value: format.failed, tone: 'error' });
      const duration = count(m.durationMs);
      if (duration !== undefined) facts.push({ label: 'duration', value: format.ms(duration) });
      return { facts, query: text(m.query), error: text(m.error) };
    }
    case 'link_approved':
    case 'link_denied': {
      const facts: AuditFact[] = [];
      const client = text(m.client);
      if (client) facts.push({ label: 'terminal', value: client });
      const origin = text(m.origin);
      if (origin) facts.push({ label: 'origin', value: origin });
      const token = text(m.tokenId);
      if (token) facts.push({ label: 'token', value: token });
      return { facts };
    }
    default:
      return null;
  }
}

/** Events whose metadata {@link auditEventDetails} reads. */
export const DETAILED_EVENTS: readonly string[] = ['data_query', 'link_approved', 'link_denied'];

/** Whether an entry reports something that went wrong: a failure event, or a data query that failed. */
export function isFailedEntry(entry: Pick<AuditEntryDto, 'event' | 'metadata'>): boolean {
  return entry.event === 'data_query' && entry.metadata?.success === false;
}
