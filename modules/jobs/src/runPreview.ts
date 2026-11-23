import { getJobExecution, getJobHistory } from './api';
import { formatProperties } from './api';
import type { JobExecutionDto, RecentRunDto } from './types';
import { attemptNumber } from './runDetails';

/** Runs of a job looked through to find a bar's run when the statistics do not carry its id. */
const HISTORY_LOOKUP = 50;
/** Characters of the error shown in a tooltip. */
export const PREVIEW_ERROR_LENGTH = 160;
/** Log lines shown in a tooltip (the last ones). */
export const PREVIEW_LOG_LINES = 3;

/** Where a run opens: its job's page with the run's details (`?run=`). */
export const runPath = (jobId: string, runId: string) => `/${encodeURIComponent(jobId)}?run=${encodeURIComponent(runId)}`;

/** Whether two start times are the same run (servers format them differently, to the millisecond or not). */
export function sameStart(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) < 1000;
}

export function findRunByStart<T extends { startedAt: string }>(runs: readonly T[], startedAt: string): T | null {
  return runs.find(run => sameStart(run.startedAt, startedAt)) ?? null;
}

/** What a tooltip adds once the run is loaded: the error (shortened), the attempt, the last log lines and the values. */
export interface RunPreview {
  error: string | null;
  attempt: number | null;
  logs: string[];
  properties: string[];
}

export function previewOf(run: JobExecutionDto): RunPreview {
  const error = run.error?.trim() ? run.error.trim() : null;
  return {
    error: error && error.length > PREVIEW_ERROR_LENGTH ? `${error.slice(0, PREVIEW_ERROR_LENGTH - 1)}…` : error,
    attempt: attemptNumber(run.retryAttempt),
    logs: (run.logs ?? []).slice(-PREVIEW_LOG_LINES).map(entry => entry.message),
    properties: formatProperties(run.properties),
  };
}

/** Loaded runs by job and run id, and by job and start time (bars without an id); null: no such run. */
const cache = new Map<string, JobExecutionDto | null>();
const idKey = (jobId: string, id: string) => `${jobId}#${id}`;
const startKey = (jobId: string, startedAt: string) => `${jobId}@${Date.parse(startedAt)}`;
const keyOf = (jobId: string, run: RecentRunDto) => (run.id ? idKey(jobId, run.id) : startKey(jobId, run.startedAt));

function remember(jobId: string, run: JobExecutionDto) {
  cache.set(idKey(jobId, run.id), run);
  cache.set(startKey(jobId, run.startedAt), run);
}

/** The run if it was loaded before (undefined: not yet). */
export function cachedRun(jobId: string, run: RecentRunDto): JobExecutionDto | null | undefined {
  return cache.get(keyOf(jobId, run));
}

/**
 * The full run of a bar, loaded once: by its id (`GET /jobs/{id}/history/{execId}`), or, when the statistics did not
 * send one, found by start time among the job's last runs (`GET /jobs/{id}/history`). Null when the run is gone.
 */
export async function loadRun(jobId: string, run: RecentRunDto, signal?: AbortSignal): Promise<JobExecutionDto | null> {
  const known = cache.get(keyOf(jobId, run));
  if (known !== undefined) return known;
  if (run.id) {
    const execution = await getJobExecution(jobId, run.id, signal);
    remember(jobId, execution);
    return execution;
  }
  const { items } = await getJobHistory(jobId, { limit: HISTORY_LOOKUP }, signal);
  items.forEach(item => remember(jobId, item));
  const found = findRunByStart(items, run.startedAt);
  if (!found) cache.set(keyOf(jobId, run), null);
  return found;
}

/** Forgets every loaded run (a run deleted, tests). */
export function clearRunCache(): void {
  cache.clear();
}
