import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JobExecutionDto } from '../../types';

vi.mock('../../api/jobs', () => ({ getJobExecution: vi.fn(), getJobHistory: vi.fn() }));
const api = await import('../../api/jobs');
const { cachedRun, clearRunCache, findRunByStart, loadRun, previewOf, runPath, sameStart, PREVIEW_ERROR_LENGTH } = await import('./runPreview');

const execution = (overrides: Partial<JobExecutionDto> = {}): JobExecutionDto => ({
  id: 'r1', jobId: 'sync', jobName: 'sync', status: 'failed', startedAt: '2026-11-18T10:00:00.123Z', completedAt: null,
  duration: 1200, triggerType: 'schedule', error: null, logs: [], ...overrides,
});

afterEach(() => {
  clearRunCache();
  vi.mocked(api.getJobExecution).mockReset();
  vi.mocked(api.getJobHistory).mockReset();
});

describe('sameStart / findRunByStart', () => {
  it('matches start times within a second, whatever their precision', () => {
    expect(sameStart('2026-11-18T10:00:00.123Z', '2026-11-18T10:00:00Z')).toBe(true);
    expect(sameStart('2026-11-18T10:00:00Z', '2026-11-18T10:00:02Z')).toBe(false);
    expect(sameStart('bad', 'bad')).toBe(false);
    const runs = [{ startedAt: '2026-11-18T09:00:00Z', id: 'a' }, { startedAt: '2026-11-18T10:00:00.4Z', id: 'b' }];
    expect(findRunByStart(runs, '2026-11-18T10:00:00Z')?.id).toBe('b');
    expect(findRunByStart(runs, '2026-11-18T11:00:00Z')).toBeNull();
  });
});

describe('previewOf', () => {
  it('shortens the error and keeps the last log lines, the attempt and the values', () => {
    const preview = previewOf(execution({
      error: 'x'.repeat(PREVIEW_ERROR_LENGTH + 50),
      retryAttempt: 1,
      logs: ['one', 'two', 'three', 'four'].map(message => ({ timestamp: '', level: 'info', message })),
      properties: { deleted: 42 },
    }));
    expect(preview.error).toHaveLength(PREVIEW_ERROR_LENGTH);
    expect(preview.error!.endsWith('…')).toBe(true);
    expect(preview.logs).toEqual(['two', 'three', 'four']);
    expect(preview.attempt).toBe(2);
    expect(preview.properties).toEqual(['deleted=42']);
  });

  it('has nothing to add for a quiet run', () => {
    expect(previewOf(execution({ error: '  ', logs: undefined as never }))).toEqual({ error: null, attempt: null, logs: [], properties: [] });
  });
});

describe('loadRun', () => {
  it('loads a run by its id once', async () => {
    vi.mocked(api.getJobExecution).mockResolvedValue(execution());
    const bar = { id: 'r1', status: 'failed', startedAt: '2026-11-18T10:00:00.123Z', duration: 1200 };
    expect(cachedRun('sync', bar)).toBeUndefined();
    expect((await loadRun('sync', bar))?.id).toBe('r1');
    expect((await loadRun('sync', bar))?.id).toBe('r1');
    expect(api.getJobExecution).toHaveBeenCalledTimes(1);
    expect(cachedRun('sync', bar)?.id).toBe('r1');
  });

  it('finds a run without an id among the job\'s last runs, remembering the others too', async () => {
    vi.mocked(api.getJobHistory).mockResolvedValue({
      items: [execution({ id: 'r2', startedAt: '2026-11-18T11:00:00.5Z' }), execution()], total: 2, limit: 50, offset: 0,
    });
    expect((await loadRun('sync', { status: 'failed', startedAt: '2026-11-18T10:00:00Z', duration: 1 }))?.id).toBe('r1');
    expect((await loadRun('sync', { status: 'failed', startedAt: '2026-11-18T11:00:00.500Z', duration: 1 }))?.id).toBe('r2');
    expect(api.getJobHistory).toHaveBeenCalledTimes(1);
    expect(await loadRun('sync', { status: 'failed', startedAt: '2026-11-18T12:00:00Z', duration: 1 })).toBeNull();
    expect(await loadRun('sync', { status: 'failed', startedAt: '2026-11-18T12:00:00Z', duration: 1 })).toBeNull();
    expect(api.getJobHistory).toHaveBeenCalledTimes(2);
  });

  it('does not remember a failed request', async () => {
    vi.mocked(api.getJobExecution).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(execution());
    const bar = { id: 'r1', status: 'failed', startedAt: '2026-11-18T10:00:00Z', duration: 1 };
    await expect(loadRun('sync', bar)).rejects.toThrow('offline');
    expect((await loadRun('sync', bar))?.id).toBe('r1');
  });
});

describe('runPath', () => {
  it('opens the run on its job\'s page', () => {
    expect(runPath('jobs:prune-history', 'a/b')).toBe('/jobs/jobs%3Aprune-history?run=a%2Fb');
  });
});
