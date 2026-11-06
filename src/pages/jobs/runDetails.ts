import type { JobExecutionDto, JobLogEntry } from '../../types';

/** What a runs table knows about a run: enough to show its details before (or without) the full run. */
export interface RunSummary {
  id: string;
  jobId: string;
  jobName?: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  error: string | null;
  triggerType?: string | null;
  retryAttempt?: number;
}

/** The attempt as people count it (1 = the first run, 2 = the first retry), or null when the server does not say. */
export function attemptNumber(retryAttempt: number | null | undefined): number | null {
  return typeof retryAttempt === 'number' && Number.isFinite(retryAttempt) && retryAttempt >= 0 ? retryAttempt + 1 : null;
}

/**
 * The run's error in full: lists may carry a shortened error, so the fetched run's wins, unless it is the shorter of
 * the two (a server that shortens both).
 */
export function fullRunError(listed: string | null | undefined, fetched: string | null | undefined): string | null {
  const a = listed?.trim() ? listed : null;
  const b = fetched?.trim() ? fetched : null;
  if (a && b) return b.length >= a.length ? b : a;
  return b ?? a;
}

/** The summary updated with what the fetched run adds. */
export function mergeRun(summary: RunSummary, fetched: JobExecutionDto | null): RunSummary {
  if (!fetched) return summary;
  return {
    ...summary,
    status: fetched.status || summary.status,
    startedAt: fetched.startedAt || summary.startedAt,
    completedAt: fetched.completedAt ?? summary.completedAt,
    duration: fetched.duration ?? summary.duration,
    triggerType: fetched.triggerType || summary.triggerType,
    retryAttempt: fetched.retryAttempt ?? summary.retryAttempt,
    error: fullRunError(summary.error, fetched.error),
  };
}

/** One log entry as a line of the log panel. */
export function runLogLine(entry: JobLogEntry): string {
  return `[${entry.timestamp}] [${entry.level}] ${entry.message}`;
}
