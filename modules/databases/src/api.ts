/** The databases plugin's API (`/api/v1/qcli/databases`), the same on the three servers. */
export const API = '/api/v1/qcli/databases';

export type MigrationStatus = 'applied' | 'pending' | 'changed' | 'missing' | 'failed';

export interface RunSummary {
  id: string;
  direction: 'up' | 'down';
  status: 'running' | 'succeeded' | 'failed';
  startedAt: string;
  finishedAt?: string;
  trigger: string;
  actor?: string;
  error?: string;
}

export interface DatabaseSummary {
  name: string;
  dialect: string;
  sources: string[];
  applied: number;
  pending: number;
  problems: number;
  lastRun?: RunSummary;
  sizeBytes?: number;
  error?: string;
}

/** `GET /:db/stats`: counters are cumulative since the server started (two samples give rates). */
export interface DatabaseStats {
  name: string;
  dialect: string;
  collectedAt: string;
  server?: { version?: string; startedAt?: string; uptimeSeconds?: number };
  size?: { bytes?: number; dataBytes?: number; indexBytes?: number; logBytes?: number };
  connections?: { active?: number; open?: number; max?: number };
  counters?: { queries?: number; transactions?: number; commits?: number; rollbacks?: number; rowsRead?: number; rowsWritten?: number };
  countersScope?: 'database' | 'server';
  cacheHitRatio?: number;
  tables?: Array<{ schema?: string; name: string; rows?: number; bytes?: number }>;
  unavailable: Array<{ metric: string; error: string }>;
}

export interface MigrationState {
  source: string;
  id: string;
  name: string;
  status: MigrationStatus;
  appliedAt?: string;
  durationMs?: number;
  appliedBy?: string;
  hasDown: boolean;
}

export interface DatabaseDetail {
  name: string;
  dialect: string;
  sources: string[];
  migrations: MigrationState[];
}

export interface Run extends RunSummary {
  target?: string;
  applied: Array<{ source: string; id: string; name: string; durationMs: number }>;
  failed?: { source: string; id: string };
}

export interface RunsPage {
  items: Run[];
  total: number;
}

export const enc = encodeURIComponent;

/** What a run would target: the migration as `source:id` (ids may repeat across sources). */
export const qualified = (m: Pick<MigrationState, 'source' | 'id'>) => `${m.source}:${m.id}`;

/** Run duration in ms, when it finished. */
export function runDuration(run: RunSummary): number | undefined {
  if (!run.finishedAt) return undefined;
  return Math.max(0, Date.parse(run.finishedAt) - Date.parse(run.startedAt));
}

export { formatBytes } from '@qodalis/cli-server-dashboard-kit';

/** Per-second rate between two cumulative counter values; null across a restart (the counter went down). */
export function rate(previous: number | undefined, current: number | undefined, seconds: number): number | null {
  if (previous === undefined || current === undefined || seconds <= 0 || current < previous) return null;
  return (current - previous) / seconds;
}

/** The numbers of the databases list's statistics cards. */
export interface DatabasesTotals {
  databases: number;
  /** The dialects, each once, sorted. */
  dialects: string[];
  /** The sum of the reported sizes; undefined when no database reports one. */
  sizeBytes?: number;
  /** The database with the largest reported size. */
  largest?: string;
  pending: number;
  /** Databases with pending migrations. */
  pendingDatabases: number;
  /** Migrations changed, missing or failed. */
  problems: number;
  /** Databases that could not be read. */
  unreachable: number;
}

/** Totals over the databases list: count, dialects, size, pending migrations, problems and unreachable databases. */
export function databasesTotals(list: readonly DatabaseSummary[]): DatabasesTotals {
  const sized = list.filter((d) => typeof d.sizeBytes === 'number');
  const largest = sized.reduce<DatabaseSummary | undefined>((max, d) => (!max || d.sizeBytes! > max.sizeBytes! ? d : max), undefined);
  return {
    databases: list.length,
    dialects: [...new Set(list.map((d) => d.dialect))].sort(),
    sizeBytes: sized.length ? sized.reduce((sum, d) => sum + d.sizeBytes!, 0) : undefined,
    largest: largest?.name,
    pending: list.reduce((n, d) => n + d.pending, 0),
    pendingDatabases: list.filter((d) => d.pending > 0).length,
    problems: list.reduce((n, d) => n + d.problems, 0),
    unreachable: list.filter((d) => d.error).length,
  };
}
