// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { LOCALES, type DashboardExtension } from '@qodalis/cli-server-dashboard-kit';
import extension from './index';
import { messages } from './messages';
import { createHarness } from './testHarness';

const module = extension as DashboardExtension;

const job = (id: string, name: string, group = 'rates') => ({
  id, name, description: '', group, status: 'active', schedule: null, interval: 60_000, enabled: true, lastRunAt: null,
  nextRunAt: null, lastRunDuration: null, overlapPolicy: 'skip', timeout: null, maxRetries: 0,
});
const hour = 3_600_000;
const now = Date.now();
const bucketStart = (i: number) => new Date(Math.floor(now / hour) * hour - (23 - i) * hour).toISOString();
const STATS = {
  bucketMs: hour,
  buckets: Array.from({ length: 24 }, (_, i) => ({ start: bucketStart(i), succeeded: i === 23 ? 3 : 0, failed: i === 23 ? 2 : 0, cancelled: 0, running: 0 })),
  totals: { total: 5, succeeded: 3, failed: 2, cancelled: 0, running: 0, successRate: 0.6, avgDuration: 10, p95Duration: 20, maxDuration: 30, lastFailureAt: new Date(now - 60_000).toISOString() },
  jobs: [
    { jobId: 'fetch', successRate: 0.5, recent: [{ status: 'failed', startedAt: new Date(now - 60_000).toISOString(), duration: 5 }] },
    { jobId: 'mail', successRate: 1, recent: [] },
    { jobId: 'sync', successRate: 0.9, recent: [{ status: 'succeeded', startedAt: new Date(now - 120_000).toISOString(), duration: 5 }] },
  ],
};
const ROUTES = {
  '/api/v1/qcli/jobs': [job('fetch', 'Fetch rates'), job('mail', 'Send mail', 'mail'), job('sync', 'Sync')],
  '/api/v1/qcli/jobs/stats': STATS,
};

const mounted: Array<() => void> = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((fn) => fn()));
  cleanup();
});

async function mountCard(id: string, harness: ReturnType<typeof createHarness>) {
  const card = module.overview!.cards!.find((c) => c.id === id)!;
  const host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => {
    const off = await card.mount(host, harness.context());
    mounted.push(() => {
      if (typeof off === 'function') off();
      host.remove();
    });
  });
  return { card, host };
}

describe('overview', () => {
  it('declares a stat card and a full-width runs chart', () => {
    expect(module.overview?.cards?.map((c) => [c.id, c.size])).toEqual([['active-jobs', 'stat'], ['runs-24h', 'full']]);
  });

  it('counts the registered jobs', async () => {
    const harness = createHarness(ROUTES);
    const { host } = await mountCard('active-jobs', harness);
    expect(await within(host).findByText('3')).toBeTruthy();
    expect(within(host).getByText('Active jobs')).toBeTruthy();
    expect(within(host).getByText('Registered jobs')).toBeTruthy();
  });

  it("charts the last 24 hours' runs; View all opens the jobs", async () => {
    const harness = createHarness(ROUTES);
    const { host } = await mountCard('runs-24h', harness);
    expect(await within(host).findByText(/Success rate: 60%/)).toBeTruthy();
    fireEvent.click(within(host).getByRole('button', { name: 'View all' }));
    expect(harness.path).toBe('/');
    expect(harness.requests).toContain('/api/v1/qcli/jobs/stats');
  });

  it('reports failing jobs as attention items, worst first, linking to each', async () => {
    const harness = createHarness(ROUTES);
    const items = await module.overview!.attention!(harness.context());
    expect(items.map((i) => [i.id, i.level, i.title, i.path])).toEqual([
      ['fetch', 'error', 'Fetch rates', '/fetch'],
      ['sync', 'error', 'Sync', '/sync'],
    ]);
    expect(items[0].detail).toBe('50% of runs succeeded · last 24 hours');
    expect(items[0].time).toBe(STATS.jobs[0].recent[0].startedAt);
  });

  it('counts the runs itself on servers without statistics', async () => {
    const harness = createHarness({
      '/api/v1/qcli/jobs': [job('fetch', 'Fetch rates')],
      '/api/v1/qcli/jobs/executions': {
        items: [{ id: 'r1', jobId: 'fetch', jobName: 'Fetch rates', status: 'failed', startedAt: new Date(now - 60_000).toISOString(), completedAt: null, duration: 5, error: 'x' }],
        total: 1, limit: 100, offset: 0,
      },
    });
    const items = await module.overview!.attention!(harness.context());
    expect(items.map((i) => i.title)).toEqual(['Fetch rates']);
  });
});

describe('palette', () => {
  it('lists every job, with its group and id', async () => {
    const harness = createHarness(ROUTES);
    const entries = await module.palette!(harness.context());
    expect(entries[0]).toEqual({ id: 'fetch', label: 'Fetch rates', hint: 'rates · fetch', icon: '⏱', path: '/fetch' });
    expect(entries).toHaveLength(3);
  });
});

describe('routing', () => {
  it('opens a job from the list', async () => {
    const harness = createHarness({
      ...ROUTES,
      '/api/v1/qcli/jobs/fetch': job('fetch', 'Fetch rates'),
      '/api/v1/qcli/jobs/fetch/history': { items: [], total: 0, limit: 20, offset: 0 },
    });
    await harness.open('/');
    fireEvent.click(await screen.findByText('Fetch rates'));
    expect(harness.path).toBe('/fetch');
    expect(await screen.findByRole('heading', { name: /Fetch rates/ })).toBeTruthy();
    expect(harness.requests).toContain('/api/v1/qcli/jobs/fetch');
    harness.close();
  });
});

describe('jobs messages', () => {
  it('translate every English text in the 10 other languages', () => {
    const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '');
    for (const [ns, all] of Object.entries(messages)) {
      const en = Object.keys(all.en);
      for (const { code } of LOCALES.filter((l) => l.code !== 'en')) {
        const own = (all as Record<string, Record<string, string> | undefined>)[code] ?? {};
        const missing = en.filter((key) => !(key in own) && !(base(key) !== key && `${base(key)}_other` in own));
        expect({ ns, code, missing }).toEqual({ ns, code, missing: [] });
      }
    }
  });
});
