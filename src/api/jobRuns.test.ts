// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { getJobHistory, getJobRuns, getRecentRuns } from './jobs';

afterEach(() => vi.unstubAllGlobals());

const page = (count: number, total: number, offset = 0) => JSON.stringify({
  items: Array.from({ length: count }, (_, i) => ({ id: `r${offset + i}`, jobId: 'j', jobName: 'j', status: 'completed', startedAt: '', completedAt: null, duration: 1, error: null })),
  total, limit: 100, offset,
});

describe('getJobRuns', () => {
  it('sends the set filters, the jobs comma-separated', async () => {
    const fetchMock = vi.fn(async () => new Response(page(0, 0), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await getJobRuns({ jobs: ['a', 'b'], group: 'rates', status: 'failed', since: '2026-11-05T19:00:00.000Z', limit: 50, offset: 100 });
    await getJobRuns();
    await getJobHistory('a b', { limit: 20, offset: 0, status: 'failed' });

    expect(fetchMock.mock.calls.map(c => (c as unknown[])[0])).toEqual([
      '/api/v1/qcli/jobs/executions?job=a%2Cb&group=rates&status=failed&since=2026-11-05T19%3A00%3A00.000Z&limit=50&offset=100',
      '/api/v1/qcli/jobs/executions',
      '/api/v1/qcli/jobs/a%20b/history?limit=20&offset=0&status=failed',
    ]);
  });
});

describe('getRecentRuns', () => {
  it('pages until the server has no more', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const offset = Number(new URL(url, 'http://x').searchParams.get('offset'));
      return new Response(page(offset < 200 ? 100 : 30, 230, offset), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getRecentRuns({ since: '2026-11-05T19:00:00.000Z' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.runs).toHaveLength(230);
    expect(result.total).toBe(230);
  });

  it('stops at the maximum and reports the total', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const params = new URL(url, 'http://x').searchParams;
      return new Response(page(Number(params.get('limit')), 5000, Number(params.get('offset'))), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getRecentRuns({}, 250);

    expect(fetchMock.mock.calls.map(c => new URL((c as unknown[])[0] as string, 'http://x').searchParams.get('limit'))).toEqual(['100', '100', '50']);
    expect(result).toMatchObject({ total: 5000 });
    expect(result.runs).toHaveLength(250);
  });

  it('fails with the status, so an older server can be told apart', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"Job not found"}', { status: 404 })));

    const error = await getRecentRuns({}).catch(e => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
  });
});

describe('insight endpoints', () => {
  it('ask with the range and filters', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { getJobStats, updateJob } = await import('./jobs');
    const { getLogHistogram } = await import('./logs');
    const { getStatusHistory } = await import('./status');
    const { getCommandStats } = await import('./commands');
    const { getAudit } = await import('./audit');

    await getJobStats({ since: '2026-11-05T00:00:00.000Z', until: '2026-11-06T00:00:00.000Z', buckets: 24, jobs: ['a', 'b'] });
    await getLogHistogram({ level: 'ERROR', search: ' x ', from: '2026-11-05T00:00:00.000Z', buckets: 30 });
    await getStatusHistory(360);
    await getCommandStats();
    await getAudit({ actor: 'ann', from: '2026-11-05T00:00:00.000Z', limit: 1000 });
    await updateJob('a b', { interval: '5m' });

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(c => c[0])).toEqual([
      '/api/v1/qcli/jobs/stats?since=2026-11-05T00%3A00%3A00.000Z&until=2026-11-06T00%3A00%3A00.000Z&buckets=24&job=a%2Cb',
      '/api/v1/qcli/logs/histogram?level=ERROR&search=x&from=2026-11-05T00%3A00%3A00.000Z&buckets=30',
      '/api/v1/qcli/status/history?minutes=360',
      '/api/v1/qcli/commands/stats',
      '/api/v1/qcli/audit?actor=ann&from=2026-11-05T00%3A00%3A00.000Z&limit=1000',
      '/api/v1/qcli/jobs/a%20b',
    ]);
    expect(calls[5][1]).toMatchObject({ method: 'PUT', body: '{"interval":"5m"}' });
  });
});

describe('auditToCsv', () => {
  it('quotes what needs quoting and puts values in one JSON column', async () => {
    const { auditToCsv } = await import('./audit');
    const csv = auditToCsv([{
      id: '1', timestamp: Date.UTC(2026, 10, 5, 9), event: 'role.save', username: 'bob', actor: 'ann, admin',
      details: 'said "hi"', properties: { count: 2 }, metadata: { remoteAddress: '10.0.0.1' },
    }]);
    expect(csv).toBe('timestamp,event,actor,username,target,details,remoteAddress,properties\r\n'
      + '2026-11-05T09:00:00.000Z,role.save,"ann, admin",bob,,"said ""hi""",10.0.0.1,"{""count"":2}"\r\n');
  });
});
