import { describe, expect, it } from 'vitest';
import type { JobDto } from '../../types';
import {
  bucketRuns, countByStatus, filterJobs, insightsFromRuns, insightsFromStats, jobGroups, outcomeOf, percentile, rangeSince,
  rangeUntil, runStats, runsByJob, shortDuration,
} from './jobInsights';

const NOW = Date.parse('2026-11-05T20:20:00.000Z');

const job = (overrides: Partial<JobDto>): JobDto => ({
  id: 'fetch-rates', name: 'Fetch rates', description: 'Pulls bank rates', group: 'rates', status: 'active',
  schedule: null, interval: 60000, enabled: true, lastRunAt: null, nextRunAt: null, lastRunDuration: null,
  overlapPolicy: 'skip', timeout: null, maxRetries: 0, ...overrides,
});

const run = (startedAt: string, status = 'completed', duration: number | null = 100, jobId = 'fetch-rates') => ({
  id: `${jobId}-${startedAt}`, jobId, jobName: jobId, status, startedAt, completedAt: null, duration, error: null,
});

describe('outcomeOf', () => {
  it('maps every server spelling', () => {
    expect(['completed', 'succeeded', 'Completed'].map(outcomeOf)).toEqual(['succeeded', 'succeeded', 'succeeded']);
    expect(['failed', 'error', 'timed_out', 'timedout'].map(outcomeOf)).toEqual(['failed', 'failed', 'failed', 'failed']);
    expect(['running', 'pending'].map(outcomeOf)).toEqual(['running', 'running']);
    expect(['cancelled', 'whatever'].map(outcomeOf)).toEqual(['cancelled', 'cancelled']);
  });
});

describe('filterJobs', () => {
  const jobs = [
    job({}),
    job({ id: 'send-alerts', name: 'Send alerts', description: '', group: 'alerts', status: 'paused' }),
    job({ id: 'cleanup', name: 'Cleanup', description: '', group: '', status: 'stopped', lastRunStatus: 'failed' }),
  ];

  it('searches the name, id, description and group, ignoring case', () => {
    expect(filterJobs(jobs, { search: ' BANK ', status: 'all', group: '' }).map(j => j.id)).toEqual(['fetch-rates']);
    expect(filterJobs(jobs, { search: 'send-al', status: 'all', group: '' }).map(j => j.id)).toEqual(['send-alerts']);
    expect(filterJobs(jobs, { search: 'alerts', status: 'all', group: '' }).map(j => j.id)).toEqual(['send-alerts']);
  });

  it('filters by status, failing last run and group', () => {
    expect(filterJobs(jobs, { search: '', status: 'paused', group: '' }).map(j => j.id)).toEqual(['send-alerts']);
    expect(filterJobs(jobs, { search: '', status: 'failing', group: '' }).map(j => j.id)).toEqual(['cleanup']);
    expect(filterJobs(jobs, { search: '', status: 'all', group: 'rates' }).map(j => j.id)).toEqual(['fetch-rates']);
  });

  it('lists groups and counts statuses', () => {
    expect(jobGroups(jobs)).toEqual(['alerts', 'rates']);
    expect(countByStatus(jobs)).toMatchObject({ all: 3, active: 1, paused: 1, stopped: 1, failing: 1, running: 0 });
  });
});

describe('runStats', () => {
  it('counts outcomes; the success rate leaves out cancelled and running runs', () => {
    const stats = runStats([
      run('a', 'completed', 100), run('b', 'completed', 300), run('c', 'failed', 200),
      run('d', 'cancelled', 50), run('e', 'running', null),
    ]);
    expect(stats).toMatchObject({ total: 5, succeeded: 2, failed: 1, cancelled: 1, running: 1, maxDuration: 300 });
    expect(stats.successRate).toBeCloseTo(2 / 3);
    expect(stats.avgDuration).toBe(162.5);
    expect(stats.p95Duration).toBe(300);
  });

  it('has no rate or durations without runs', () => {
    expect(runStats([])).toMatchObject({ total: 0, successRate: null, avgDuration: null, p95Duration: null });
  });

  it('takes the nearest-rank percentile', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(5);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe('bucketRuns', () => {
  it('cuts the range into aligned columns ending after now and counts each run where it started', () => {
    const buckets = bucketRuns([
      run('2026-11-05T20:10:00.000Z'), run('2026-11-05T20:59:59.000Z', 'failed'),
      run('2026-11-05T19:30:00.000Z'), run('2026-11-04T20:59:00.000Z'), run('not a date'),
    ], '24h', NOW);

    expect(buckets).toHaveLength(24);
    expect(new Date(buckets[23].start).toISOString()).toBe('2026-11-05T20:00:00.000Z');
    expect(new Date(buckets[0].start).toISOString()).toBe('2026-11-04T21:00:00.000Z');
    expect(buckets[23].counts).toEqual({ succeeded: 1, failed: 1, cancelled: 0, running: 0 });
    expect(buckets[22].total).toBe(1);
    expect(buckets.reduce((sum, b) => sum + b.total, 0)).toBe(3);
  });

  it('starts the server query where the first column starts', () => {
    expect(rangeSince('24h', NOW)).toBe('2026-11-04T21:00:00.000Z');
    expect(rangeSince('1h', NOW)).toBe('2026-11-05T19:25:00.000Z');
    expect(bucketRuns([], '7d', NOW)).toHaveLength(28);
  });
});

describe('runsByJob', () => {
  it('keeps each job’s runs in listed order', () => {
    const byJob = runsByJob([run('b', 'completed', 1, 'x'), run('a', 'completed', 1, 'y'), run('c', 'completed', 1, 'x')]);
    expect(byJob.get('x')!.map(r => r.startedAt)).toEqual(['b', 'c']);
    expect(byJob.get('y')).toHaveLength(1);
  });
});

describe('shortDuration', () => {
  it('picks a unit', () => {
    expect([850, 2400, 42_000, 200_000, 3_900_000].map(shortDuration)).toEqual(['850ms', '2.4s', '42s', '3m 20s', '1h 5m']);
    expect(shortDuration(null)).toBe('—');
    expect(shortDuration(-1)).toBe('—');
  });
});

describe('insightsFromStats', () => {
  it('turns the server statistics into the page numbers', () => {
    const insights = insightsFromStats({
      since: '2026-11-05T00:00:00.000Z', until: '2026-11-05T02:00:00.000Z', bucketMs: 3_600_000,
      buckets: [
        { start: '2026-11-05T00:00:00.000Z', succeeded: 3, failed: 1, cancelled: 0, running: 0 },
        { start: '2026-11-05T01:00:00.000Z', succeeded: 0, failed: 0, cancelled: 1, running: 1 },
      ],
      totals: { total: 6, succeeded: 3, failed: 1, cancelled: 1, running: 1, successRate: 0.75, avgDuration: 10, p95Duration: 20, maxDuration: 30, lastFailureAt: '2026-11-05T00:30:00.000Z' },
      jobs: [{ jobId: 'a', jobName: 'A', total: 6, succeeded: 3, failed: 1, cancelled: 1, running: 1, successRate: 0.75, avgDuration: 10, p95Duration: 20, maxDuration: 30, lastFailureAt: null, recent: [] }],
    });
    expect(insights.buckets.map(b => [b.total, b.end - b.start])).toEqual([[4, 3_600_000], [2, 3_600_000]]);
    expect(insights.stats).toMatchObject({ total: 6, successRate: 0.75, p95Duration: 20 });
    expect(insights.lastFailureAt).toBe('2026-11-05T00:30:00.000Z');
    expect(insights.jobs.get('a')?.successRate).toBe(0.75);
  });

  it('reads values a server left out (no finished run) as null, not NaN', () => {
    const insights = insightsFromStats(JSON.parse(JSON.stringify({
      since: '2026-11-05T00:00:00.000Z', until: '2026-11-05T01:00:00.000Z', bucketMs: 3_600_000,
      buckets: [{ start: '2026-11-05T00:00:00.000Z', succeeded: 0, failed: 0, cancelled: 0, running: 0 }],
      totals: { total: 0, succeeded: 0, failed: 0, cancelled: 0, running: 0 },
      jobs: [{ jobId: 'a', jobName: 'A', total: 0, succeeded: 0, failed: 0, cancelled: 0, running: 0 }],
    })));
    expect(insights.stats).toMatchObject({ successRate: null, avgDuration: null, p95Duration: null, maxDuration: null });
    expect(insights.lastFailureAt).toBeNull();
    expect(insights.jobs.get('a')).toEqual({ successRate: null, recent: [] });
  });

  it('counts loaded runs the same way on older servers', () => {
    const insights = insightsFromRuns([run('2026-11-05T20:10:00.000Z', 'failed')], '24h', NOW);
    expect(insights.stats.failed).toBe(1);
    expect(insights.lastFailureAt).toBe('2026-11-05T20:10:00.000Z');
    expect(insights.jobs.get('fetch-rates')?.successRate).toBe(0);
    expect(rangeUntil('24h', NOW)).toBe('2026-11-05T21:00:00.000Z');
  });
});
