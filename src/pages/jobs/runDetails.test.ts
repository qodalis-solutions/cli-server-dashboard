import { describe, expect, it } from 'vitest';
import { attemptNumber, fullRunError, mergeRun, runLogLine, type RunSummary } from './runDetails';
import type { JobExecutionDto } from '../../types';

const summary: RunSummary = {
  id: 'e1', jobId: 'sync', jobName: 'Sync', status: 'failed', startedAt: '2026-11-06T10:00:00Z', completedAt: null,
  duration: 1200, error: 'Connection refused (sho…', retryAttempt: 1,
};

const fetched = (fields: Partial<JobExecutionDto>): JobExecutionDto => ({
  id: 'e1', jobId: 'sync', jobName: 'Sync', status: 'failed', startedAt: '2026-11-06T10:00:00Z', completedAt: '2026-11-06T10:00:01Z',
  duration: 1250, triggerType: 'schedule', error: null, logs: [], ...fields,
});

describe('attemptNumber', () => {
  it('counts from 1', () => {
    expect(attemptNumber(0)).toBe(1);
    expect(attemptNumber(2)).toBe(3);
  });
  it('is null when unknown', () => {
    expect(attemptNumber(undefined)).toBeNull();
    expect(attemptNumber(null)).toBeNull();
    expect(attemptNumber(-1)).toBeNull();
    expect(attemptNumber(Number.NaN)).toBeNull();
  });
});

describe('fullRunError', () => {
  it('prefers the fetched error', () => {
    expect(fullRunError('Boom (sho…', 'Boom (shortened in the list)\n  at x()')).toBe('Boom (shortened in the list)\n  at x()');
  });
  it('keeps the longer one when the fetched run is shorter', () => {
    expect(fullRunError('Boom with details', 'Boom')).toBe('Boom with details');
  });
  it('falls back to whichever exists', () => {
    expect(fullRunError('Boom', null)).toBe('Boom');
    expect(fullRunError(null, 'Boom')).toBe('Boom');
    expect(fullRunError('  ', '')).toBeNull();
    expect(fullRunError(undefined, undefined)).toBeNull();
  });
});

describe('mergeRun', () => {
  it('keeps the summary without a fetched run', () => {
    expect(mergeRun(summary, null)).toBe(summary);
  });
  it('takes the full error and the fetched values', () => {
    const merged = mergeRun(summary, fetched({ error: 'Connection refused (shortened in the list)', retryAttempt: 2 }));
    expect(merged.error).toBe('Connection refused (shortened in the list)');
    expect(merged.duration).toBe(1250);
    expect(merged.completedAt).toBe('2026-11-06T10:00:01Z');
    expect(merged.triggerType).toBe('schedule');
    expect(merged.retryAttempt).toBe(2);
  });
  it('keeps the listed attempt when the run has none', () => {
    expect(mergeRun(summary, fetched({})).retryAttempt).toBe(1);
  });
});

describe('runLogLine', () => {
  it('formats an entry like the log panel', () => {
    expect(runLogLine({ timestamp: '2026-11-06T10:00:00Z', level: 'ERROR', message: 'boom' })).toBe('[2026-11-06T10:00:00Z] [ERROR] boom');
  });
});
