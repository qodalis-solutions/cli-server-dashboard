/** The jobs plugin's API types (`/api/v1/qcli/jobs`), the same on the three servers. */

/** Runs of one column or one job, by result. */
export interface RunCounts {
  succeeded: number;
  failed: number;
  cancelled: number;
  running: number;
}

export interface RunTotals extends RunCounts {
  total: number;
  successRate: number | null;
  avgDuration: number | null;
  p95Duration: number | null;
  maxDuration: number | null;
  lastFailureAt: string | null;
}

export type PropertyBag = Record<string, unknown>;

export interface JobDto {
  id: string;
  name: string;
  description: string;
  group: string;
  /** Free-form labels to filter by (servers 1.0.0-beta.25; absent on older servers). */
  tags?: string[] | null;
  status: string;
  schedule: string | null;
  /** Milliseconds (.NET) or a duration such as "30s" (Node, Python). */
  interval: number | string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus?: string | null;
  /** Milliseconds. */
  lastRunDuration: number | null;
  /** The newest running run. */
  currentExecutionId?: string | null;
  /** Every running run, oldest first (servers 1.0.0-beta.23). */
  runningExecutionIds?: string[] | null;
  /** A run waits for a free slot (overlap policy `queue`). */
  queued?: boolean | null;
  /** Runs of the job that may go at the same time (servers 1.0.0-beta.23; absent: 1). */
  maxConcurrentRuns?: number | null;
  overlapPolicy: string;
  /** Milliseconds (.NET) or a duration such as "5m" (Node, Python). */
  timeout: number | string | null;
  maxRetries: number;
  /** Actions the job offers (`trigger`, `pause`, `resume`, `stop`, `cancel`, `update`); absent or null: all. */
  actions?: string[] | null;
  /**
   * How long the job's runs are kept (servers 1.0.0-beta.28; absent on older servers). Null: no limits, history is
   * kept forever.
   */
  historyRetention?: JobHistoryRetentionDto | null;
}

export interface JobHistoryRetentionDto {
  /** Milliseconds (.NET) or a duration such as "30d" (Node, Python); null: no age limit. */
  maxAge: number | string | null;
  /** Runs kept per job; null: no count limit. */
  maxRunsPerJob: number | null;
  /** Like `maxAge`, for failed runs. */
  failedMaxAge: number | string | null;
  /** Like `maxRunsPerJob`, for failed runs. */
  failedMaxRunsPerJob: number | null;
  /** The job sets its own limits instead of the global ones. */
  overridden: boolean;
  /** The job keeps every run, whatever the global limits. */
  keepAll: boolean;
}

export interface JobExecutionDto {
  id: string;
  jobId: string;
  jobName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  triggerType: string;
  error: string | null;
  /** 0 for the first run, 1 for the first retry, … */
  retryAttempt?: number;
  logs: JobLogEntry[];
  /** The job's own values for this run (e.g. items, changed). */
  properties?: PropertyBag;
}

export interface JobLogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export interface JobRunDto {
  id: string;
  jobId: string;
  jobName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  /** Milliseconds. */
  duration: number | null;
  error: string | null;
  triggerType?: string | null;
  retryAttempt?: number;
  logCount?: number;
  properties?: PropertyBag;
}

export interface JobRunsResponse {
  items: JobRunDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface JobHistoryResponse {
  items: JobExecutionDto[];
  total: number;
  limit: number;
  offset: number;
}

// Filesystem types

export interface RecentRunDto {
  id?: string | null;
  status: string;
  startedAt: string;
  duration: number | null;
}

export interface JobStatsResponse {
  since: string;
  until: string;
  bucketMs: number;
  buckets: (RunCounts & { start: string })[];
  totals: RunTotals;
  jobs: (RunTotals & {
    jobId: string;
    jobName: string;
    /** Newest first, at most 12. */
    recent: RecentRunDto[];
  })[];
}

// GET /api/v1/qcli/logs/histogram
