import { describe, expect, it } from 'vitest';
import type { JobDto, JobHistoryRetentionDto } from '../../types';
import { PRUNE_JOB_ID, deletedCount, findPruneJob, retentionLimits, retentionSource } from './retention';

const retention = (overrides: Partial<JobHistoryRetentionDto> = {}): JobHistoryRetentionDto => ({
  maxAge: null, maxRunsPerJob: null, failedMaxAge: null, failedMaxRunsPerJob: null, overridden: false, keepAll: false, ...overrides,
});

const job = (id: string): JobDto => ({
  id, name: id, description: '', group: 'system', status: 'active', schedule: null, interval: 3_600_000, enabled: true,
  lastRunAt: null, nextRunAt: null, lastRunDuration: null, overlapPolicy: 'skip', timeout: null, maxRetries: 0,
});

describe('retentionSource', () => {
  it('tells where the limits come from', () => {
    expect(retentionSource(null)).toBe('forever');
    expect(retentionSource(retention())).toBe('global');
    expect(retentionSource(retention({ overridden: true }))).toBe('overridden');
    expect(retentionSource(retention({ overridden: true, keepAll: true }))).toBe('keepAll');
  });
});

describe('retentionLimits', () => {
  it('formats milliseconds (.NET) and counts in order', () => {
    expect(retentionLimits(retention({ maxAge: 30 * 86_400_000, maxRunsPerJob: 500, failedMaxAge: 90 * 86_400_000, failedMaxRunsPerJob: 0 }))).toEqual([
      { limit: 'maxAge', value: '30d' },
      { limit: 'maxRunsPerJob', value: '500' },
      { limit: 'failedMaxAge', value: '90d' },
      { limit: 'failedMaxRunsPerJob', value: '0' },
    ]);
  });

  it('keeps duration strings (Node, Python) and marks missing limits as null', () => {
    expect(retentionLimits(retention({ maxAge: '30d', failedMaxAge: '' })).map(l => l.value)).toEqual(['30d', null, null, null]);
  });
});

describe('findPruneJob', () => {
  it('finds the built-in prune job', () => {
    expect(findPruneJob([job('fetch-rates'), job(PRUNE_JOB_ID)])?.id).toBe(PRUNE_JOB_ID);
    expect(findPruneJob([job('fetch-rates')])).toBeNull();
  });
});

describe('deletedCount', () => {
  it('reads properties.deleted as a number or numeric string', () => {
    expect(deletedCount({ deleted: 42 })).toBe(42);
    expect(deletedCount({ deleted: '7' })).toBe(7);
    expect(deletedCount({ deleted: 0 })).toBe(0);
  });

  it('is null when absent or not a count', () => {
    expect(deletedCount(undefined)).toBeNull();
    expect(deletedCount(null)).toBeNull();
    expect(deletedCount({})).toBeNull();
    expect(deletedCount({ deleted: 'many' })).toBeNull();
    expect(deletedCount({ deleted: '' })).toBeNull();
    expect(deletedCount({ deleted: -1 })).toBeNull();
  });
});
