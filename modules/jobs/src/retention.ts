import { formatSpan } from './api';
import type { JobDto, JobHistoryRetentionDto, PropertyBag } from './types';

/** The built-in job that deletes old runs when history retention is configured. */
export const PRUNE_JOB_ID = 'jobs:prune-history';

/** The limits of a retention, in the order the job page lists them. */
export const RETENTION_LIMITS = ['maxAge', 'maxRunsPerJob', 'failedMaxAge', 'failedMaxRunsPerJob'] as const;
export type RetentionLimit = (typeof RETENTION_LIMITS)[number];

/** Where a job's retention comes from: none at all, the job keeps every run, its own limits or the global ones. */
export type RetentionSource = 'forever' | 'keepAll' | 'overridden' | 'global';

export function retentionSource(retention: JobHistoryRetentionDto | null): RetentionSource {
  if (!retention) return 'forever';
  if (retention.keepAll) return 'keepAll';
  return retention.overridden ? 'overridden' : 'global';
}

/** Each limit as shown: a short duration ("30d") or a count, null when there is none. */
export function retentionLimits(retention: JobHistoryRetentionDto): { limit: RetentionLimit; value: string | null }[] {
  const count = (value: number | null) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? String(value) : null);
  return [
    { limit: 'maxAge', value: formatSpan(retention.maxAge) },
    { limit: 'maxRunsPerJob', value: count(retention.maxRunsPerJob) },
    { limit: 'failedMaxAge', value: formatSpan(retention.failedMaxAge) },
    { limit: 'failedMaxRunsPerJob', value: count(retention.failedMaxRunsPerJob) },
  ];
}

/** The prune job, when the server runs one. */
export function findPruneJob(jobs: readonly JobDto[]): JobDto | null {
  return jobs.find(job => job.id === PRUNE_JOB_ID) ?? null;
}

/** How many runs a prune run deleted (`properties.deleted`, a number or a numeric string), or null. */
export function deletedCount(properties: PropertyBag | null | undefined): number | null {
  const value = properties?.deleted;
  const count = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? count : null;
}
