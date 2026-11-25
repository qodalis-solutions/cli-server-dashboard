// @vitest-environment jsdom
/** Loading placeholders, failures and Retry of the jobs pages and Overview cards. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { DashboardExtension } from '@qodalis/cli-server-dashboard-kit';
import extension from './index';
import { createHarness, json } from './testHarness';

const job = (id: string, name: string) => ({
  id, name, description: '', group: 'rates', status: 'active', schedule: null, interval: 60_000, enabled: true, lastRunAt: null,
  nextRunAt: null, lastRunDuration: null, overlapPolicy: 'skip', timeout: null, maxRetries: 0,
});
const JOBS = [job('fetch', 'Fetch rates'), job('mail', 'Send mail')];

let harness: ReturnType<typeof createHarness> | undefined;

/**
 * A harness whose answers come from `answer(path)` (query left out): a Response, a promise of one (held), or
 * undefined for the default (`[]`).
 */
function serve(answer: (path: string) => Response | Promise<Response> | undefined) {
  harness = createHarness();
  harness.fetch.mockImplementation(async (path: string) => {
    harness!.requests.push(path.split('?')[0]);
    const pathname = path.split('?')[0];
    return (await answer(pathname)) ?? (pathname.endsWith('/history') ? json({ items: [], total: 0 }) : json([]));
  });
  return harness;
}

/** A request held until the test answers it. */
function held() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>(r => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  harness?.close();
  harness = undefined;
  cleanup();
});

describe('jobs page', () => {
  it('shows a jobs table skeleton and run stat card placeholders until the server answers', async () => {
    const jobs = held();
    const stats = held();
    const runs = held();
    await serve(path => (path === '/api/v1/qcli/jobs' ? jobs.promise : path === '/api/v1/qcli/jobs/stats' ? stats.promise
      : path === '/api/v1/qcli/jobs/executions' ? runs.promise : undefined)).open('/');

    const table = screen.getByText('Loading jobs…').closest('[role=status]')!;
    expect(table.querySelectorAll(':scope > div').length).toBeGreaterThan(1);
    const statCards = screen.getAllByRole('status').find(s => s.className.includes('contents'))!;
    expect(statCards.querySelectorAll('.rounded-xl')).toHaveLength(4);

    await act(async () => jobs.resolve(json(JOBS)));
    expect(await screen.findByText('Fetch rates')).toBeTruthy();
    expect(screen.queryByText('Loading jobs…')).toBeNull();
  });

  it('shows placeholder bars in each job\'s Last runs until its runs arrive', async () => {
    const stats = held();
    const runs = held();
    await serve(path => (path === '/api/v1/qcli/jobs' ? json(JOBS) : path === '/api/v1/qcli/jobs/stats' ? stats.promise
      : path === '/api/v1/qcli/jobs/executions' ? runs.promise : undefined)).open('/');

    const row = (await screen.findByText('Fetch rates')).closest('tr')!;
    const strip = within(row).getByRole('status');
    expect(strip.textContent).toContain('Last runs');
    expect(strip.querySelectorAll('.w-1\\.5')).toHaveLength(12);
    const strips = () => screen.queryAllByRole('status').filter(s => s.closest('tr'));
    expect(strips()).toHaveLength(JOBS.length);

    const run = { id: 'r1', jobId: 'fetch', jobName: 'Fetch rates', status: 'completed', startedAt: new Date().toISOString(), completedAt: null, duration: 5 };
    await act(async () => {
      stats.resolve(json({ error: 'no stats' }, 404));
      runs.resolve(json({ items: [run], total: 1, limit: 100, offset: 0 }));
    });
    await waitFor(() => expect(strips()).toHaveLength(0));
    expect(within(row).getByText('100%')).toBeTruthy();
  });

  it('shows a failed job list with Retry, and Retry loads it', async () => {
    let fail = true;
    await serve(path => (path === '/api/v1/qcli/jobs' ? (fail ? json({ error: 'scheduler down' }, 500) : json(JOBS)) : undefined)).open('/');

    const alert = await screen.findByText(/scheduler down/);
    const box = alert.closest('[role=alert]')!;
    fail = false;
    await act(async () => fireEvent.click(within(box as HTMLElement).getByRole('button', { name: 'Retry' })));
    expect(await screen.findByText('Fetch rates')).toBeTruthy();
    expect(screen.queryByText(/scheduler down/)).toBeNull();
  });

  it('shows a failed run list with Retry, and Retry loads the runs again', async () => {
    let fail = true;
    const runs = { items: [], total: 0, limit: 100, offset: 0 };
    await serve(path => {
      if (path === '/api/v1/qcli/jobs') return json(JOBS);
      if (path === '/api/v1/qcli/jobs/executions') return fail ? json({ error: 'runs table locked' }, 500) : json(runs);
      return undefined;
    }).open('/');

    const message = await screen.findByText('Could not load runs: runs table locked');
    fail = false;
    const calls = harness!.requests.filter(p => p === '/api/v1/qcli/jobs/executions').length;
    await act(async () => fireEvent.click(within(message.closest('[role=alert]') as HTMLElement).getByRole('button', { name: 'Retry' })));
    await waitFor(() => expect(harness!.requests.filter(p => p === '/api/v1/qcli/jobs/executions').length).toBeGreaterThan(calls));
    await waitFor(() => expect(screen.queryByText('Could not load runs: runs table locked')).toBeNull());
  });

  it('shows a runs chart placeholder on the runs tab while the numbers load', async () => {
    const stats = held();
    const runs = held();
    await serve(path => (path === '/api/v1/qcli/jobs' ? json(JOBS) : path === '/api/v1/qcli/jobs/stats' ? stats.promise
      : path === '/api/v1/qcli/jobs/executions' ? runs.promise : undefined)).open('/?tab=runs');
    await screen.findByRole('tab', { name: /Recent runs/ });
    const chart = screen.getByText('Runs over time', { selector: '.sr-only' }).closest('[role=status]')!;
    expect(chart.querySelector('[style*="height: 180px"]')).not.toBeNull();
  });
});

describe('job page', () => {
  it('shows a page skeleton until the job arrives', async () => {
    const detail = held();
    await serve(path => (path === '/api/v1/qcli/jobs/fetch' ? detail.promise : undefined)).open('/fetch');

    expect(screen.getByRole('status').textContent).toBe('Loading job details…');
    await act(async () => detail.resolve(json(JOBS[0])));
    expect(await screen.findByText('Job Information')).toBeTruthy();
  });

  it('says so when the job cannot be loaded, and Retry loads it', async () => {
    let fail = true;
    await serve(path => (path === '/api/v1/qcli/jobs/fetch' ? (fail ? json({ error: 'job store offline' }, 500) : json(JOBS[0])) : undefined)).open('/fetch');

    const reason = await screen.findByText(/job store offline/);
    fail = false;
    await act(async () => fireEvent.click(within(reason.closest('[role=alert]') as HTMLElement).getByRole('button', { name: 'Retry' })));
    expect(await screen.findByText('Job Information')).toBeTruthy();
  });

  it('shows a history table skeleton until the runs arrive, and a failed history with Retry', async () => {
    const history = held();
    await serve(path => (path === '/api/v1/qcli/jobs/fetch' ? json(JOBS[0]) : path === '/api/v1/qcli/jobs/fetch/history' ? history.promise : undefined)).open('/fetch');

    expect(await screen.findByText('Loading history…')).toBeTruthy();
    await act(async () => history.resolve(json({ error: 'history unavailable' }, 500)));
    expect((await screen.findAllByText(/history unavailable/)).length).toBeGreaterThan(0);
  });
});

describe('Overview cards', () => {
  const module = extension as DashboardExtension;
  const mounted: Array<() => void> = [];
  afterEach(() => {
    act(() => mounted.splice(0).forEach(fn => fn()));
  });

  async function mountCard(id: string, h: ReturnType<typeof createHarness>) {
    const card = module.overview!.cards!.find(c => c.id === id)!;
    const host = document.createElement('div');
    document.body.appendChild(host);
    await act(async () => {
      const off = await card.mount(host, h.context());
      mounted.push(() => {
        if (typeof off === 'function') off();
        host.remove();
      });
    });
    return host;
  }

  it('the active jobs card is a stat card placeholder until the jobs arrive', async () => {
    const jobs = held();
    const host = await mountCard('active-jobs', serve(path => (path === '/api/v1/qcli/jobs' ? jobs.promise : undefined)));
    expect(within(host).getByRole('status').textContent).toBe('Active jobs');

    await act(async () => jobs.resolve(json(JOBS)));
    expect(await within(host).findByText('2')).toBeTruthy();
    expect(within(host).queryByRole('status')).toBeNull();
  });

  it('the runs card holds its place while the numbers load, and leaves it on a server without runs', async () => {
    const stats = held();
    const runs = held();
    const host = await mountCard('runs-24h', serve(path =>
      path === '/api/v1/qcli/jobs/stats' ? stats.promise : path === '/api/v1/qcli/jobs/executions' ? runs.promise : undefined));
    expect(within(host).getByRole('status').querySelector('[style*="height: 162px"]')).not.toBeNull();

    await act(async () => stats.resolve(json({ error: 'not found' }, 404)));
    await act(async () => runs.resolve(json({ error: 'not found' }, 404)));
    await waitFor(() => expect(within(host).queryByRole('status')).toBeNull());
    expect(host.textContent).toBe('');
  });
});

