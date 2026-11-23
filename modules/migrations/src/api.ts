/** The migrations plugin's API (`/api/v1/qcli/migrations`), the same on the three servers. */
export const API = '/api/v1/qcli/migrations';

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
  error?: string;
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
