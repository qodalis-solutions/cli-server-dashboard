// @vitest-environment jsdom
/** The jobs page as the dashboard shows it (ported from the dashboard's App tests). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { clearRunCache } from './runPreview';
import { createHarness, PAGE_URL } from './testHarness';

let server: ReturnType<typeof createHarness> | undefined;
const track = <T extends ReturnType<typeof createHarness>>(h: T): T => (server = h);

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  server?.close();
  server = undefined;
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('job history retention', () => {
  const job = (overrides: Record<string, unknown>) => ({
    description: '', group: 'rates', status: 'active', schedule: null, interval: 3_600_000, enabled: true, lastRunAt: null,
    nextRunAt: null, lastRunDuration: null, overlapPolicy: 'skip', timeout: null, maxRetries: 0, ...overrides,
  });
  const prune = job({ id: 'jobs:prune-history', name: 'jobs:prune-history', group: 'system', tags: ['system'] });
  const pruneRun = {
    id: 'p1', jobId: 'jobs:prune-history', jobName: 'jobs:prune-history', status: 'completed',
    startedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(), completedAt: null, duration: 12, triggerType: 'schedule',
    error: null, logs: [], properties: { deleted: 42 },
  };

  it('shows the prune job\'s last run on the jobs page, linking to it', async () => {
    const server = track(createHarness({
      '/api/v1/qcli/jobs': [job({ id: 'fetch-rates', name: 'Fetch rates' }), prune],
      '/api/v1/qcli/jobs/jobs%3Aprune-history/history': { items: [pruneRun], total: 1, limit: 1, offset: 0 },
    }));
    await server.open('/');

    const link = (await screen.findByText('42 runs deleted')).closest('a')!;
    expect(link.getAttribute('href')).toBe(`${PAGE_URL}/jobs%3Aprune-history`);
    expect(within(link).getByText('History pruning')).toBeTruthy();
    expect(within(link).getByText('Last run 2 hours ago')).toBeTruthy();
    expect(within(link).getByText('completed')).toBeTruthy();
  });

  it('shows a job\'s limits and whether they are its own, and hides them on older servers', async () => {
    const retention = { maxAge: 30 * 86_400_000, maxRunsPerJob: 500, failedMaxAge: null, failedMaxRunsPerJob: 50, overridden: true, keepAll: false };
    const server = track(createHarness({
      '/api/v1/qcli/jobs/fetch-rates': job({ id: 'fetch-rates', name: 'Fetch rates', historyRetention: retention }),
      '/api/v1/qcli/jobs/fetch-rates/history': { items: [], total: 0, limit: 20, offset: 0 },
      '/api/v1/qcli/jobs/old': job({ id: 'old', name: 'Old server job' }),
      '/api/v1/qcli/jobs/old/history': { items: [], total: 0, limit: 20, offset: 0 },
    }));
    await server.open('/fetch-rates');

    expect(await screen.findByText('History Retention')).toBeTruthy();
    expect(screen.getByText('Overridden for this job')).toBeTruthy();
    expect(screen.getByText('30d')).toBeTruthy();
    expect(screen.getByText('500')).toBeTruthy();
    expect(screen.getByText('No limit')).toBeTruthy();
    expect(screen.getByText('50')).toBeTruthy();
    server.close();

    await server.open('/old');
    expect((await screen.findAllByText('Old server job')).length).toBeGreaterThan(0);
    expect(screen.queryByText('History Retention')).toBeNull();
  });

  it('groups a run\'s actions on the job page, deleting it from the overflow menu after a confirmation', async () => {
    const run = {
      id: 'e1', jobId: 'fetch-rates', jobName: 'Fetch rates', status: 'failed', startedAt: new Date(0).toISOString(),
      completedAt: new Date(1000).toISOString(), duration: 1000, triggerType: 'schedule', error: 'boom', logs: [],
    };
    const server = track(createHarness({
      '/api/v1/qcli/jobs/fetch-rates': job({ id: 'fetch-rates', name: 'Fetch rates' }),
      '/api/v1/qcli/jobs/fetch-rates/history': { items: [run], total: 1, limit: 20, offset: 0 },
      '/api/v1/qcli/jobs/fetch-rates/history/e1': {},
    }));
    await server.open('/fetch-rates');

    const group = await screen.findByRole('group', { name: /^Actions for (?!Fetch rates)/ });
    expect(within(group).getAllByRole('button').map(b => b.getAttribute('aria-label') ?? b.textContent))
      .toEqual(['Logs', 'Details', 'Run again', 'More actions']);
    fireEvent.click(within(group).getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete run?' });
    expect(server.requests).not.toContain('/api/v1/qcli/jobs/fetch-rates/history/e1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(server.requests).toContain('/api/v1/qcli/jobs/fetch-rates/history/e1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says a job without limits keeps its history forever', async () => {
    const server = track(createHarness({
      '/api/v1/qcli/jobs/fetch-rates': job({ id: 'fetch-rates', name: 'Fetch rates', historyRetention: null }),
      '/api/v1/qcli/jobs/fetch-rates/history': { items: [], total: 0, limit: 20, offset: 0 },
    }));
    await server.open('/fetch-rates');

    expect(await screen.findByText('Kept forever')).toBeTruthy();
    expect(screen.getByText('No retention is configured: every run is kept forever.')).toBeTruthy();
  });
});

describe('jobs page', () => {
  const jobs = Array.from({ length: 3 }, (_, i) => ({
    id: `job-${i}`, name: `Job ${i}`, description: '', group: i === 0 ? 'rates' : 'mail', status: 'active', schedule: null,
    interval: 60_000, enabled: true, lastRunAt: null, nextRunAt: null, lastRunDuration: null, overlapPolicy: 'skip', timeout: null,
    maxRetries: 0,
  }));

  it('folds the filters away, shows how many are set and remembers it', async () => {
    const server = track(createHarness({ '/api/v1/qcli/jobs': jobs }));
    await server.open('/?q=job&group=rates');

    const toggle = await screen.findByRole('button', { name: /Filters/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(toggle).getByLabelText('2 filters set')).toBeTruthy();
    expect(screen.getByLabelText('Search jobs…')).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Search jobs…')).toBeNull();
    expect(localStorage.getItem('qcli_admin_jobs_filters_open')).toBe('false');
    // Still filtered while folded
    expect(await screen.findByText('Job 0')).toBeTruthy();
    expect(screen.queryByText('Job 1')).toBeNull();
    server.close();

    await server.open('/');
    expect((await screen.findByRole('button', { name: /Filters/ })).getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the jobs or their recent runs, one tab at a time, kept in the URL', async () => {
    const run = {
      id: 'r1', jobId: 'job-1', jobName: 'Job 1', status: 'failed', startedAt: new Date(Date.now() - 60_000).toISOString(),
      completedAt: null, duration: 5, error: 'boom',
    };
    const server = track(createHarness({
      '/api/v1/qcli/jobs': jobs,
      '/api/v1/qcli/jobs/executions': { items: [run], total: 1, limit: 100, offset: 0 },
    }));
    await server.open('/');

    const jobsTab = await screen.findByRole('tab', { name: /Jobs/ });
    expect(jobsTab.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText('Job 2')).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Recent runs/ }));
    expect(await screen.findByText('boom')).toBeTruthy();
    expect(screen.queryByText('Job 2')).toBeNull();
    server.close();

    await server.open('/?tab=runs');
    expect((await screen.findByRole('tab', { name: /Recent runs/ })).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText('boom')).toBeTruthy();
  });

  it('pages the jobs in the page and the runs on the server, remembering the page size', async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ ...jobs[0], id: `many-${i}`, name: `Many ${String(i).padStart(2, '0')}` }));
    const runs = Array.from({ length: 20 }, (_, i) => ({
      id: `r${i}`, jobId: 'many-0', jobName: 'Many 00', status: 'completed', startedAt: new Date(Date.now() - i * 60_000).toISOString(),
      completedAt: null, duration: 5, error: i === 0 ? 'first page' : null,
    }));
    const server = track(createHarness({
      '/api/v1/qcli/jobs': many,
      '/api/v1/qcli/jobs/executions': { items: runs, total: 950, limit: 20, offset: 0 },
    }));
    await server.open('/');

    expect(await screen.findByText('Many 00')).toBeTruthy();
    expect(screen.queryByText('Many 20')).toBeNull();
    expect(screen.getByText('1–20 of 45')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Many 20')).toBeTruthy();
    expect(screen.queryByText('Many 00')).toBeNull();
    fireEvent.click(screen.getByRole('combobox', { name: 'Rows per page' }));
    fireEvent.click(screen.getByRole('option', { name: '50' }));
    expect(screen.getByText('Many 44')).toBeTruthy();
    expect(localStorage.getItem('qcli_admin_jobs_page_size')).toBe('50');

    // Runs: the total comes from the server, the next page is asked for by offset
    fireEvent.click(screen.getByRole('tab', { name: /Recent runs/ }));
    expect(await screen.findByText('1–20 of 950')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(server.fetch.mock.calls.map(([u]) => String(u))
      .some(u => u.startsWith('/api/v1/qcli/jobs/executions?') && u.includes('limit=20') && u.includes('offset=20'))).toBe(true));
  });

  it('lists timed out and error runs under Failed, paging the loaded runs instead of asking the server for one status', async () => {
    const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    const runs = [
      { id: 'r1', jobId: 'job-0', jobName: 'Job 0', status: 'failed', startedAt: at(1), completedAt: null, duration: 5, error: 'plain failure' },
      { id: 'r2', jobId: 'job-0', jobName: 'Job 0', status: 'timed_out', startedAt: at(2), completedAt: null, duration: 5, error: 'took too long' },
      { id: 'r3', jobId: 'job-1', jobName: 'Job 1', status: 'error', startedAt: at(3), completedAt: null, duration: 5, error: 'crashed' },
      { id: 'r4', jobId: 'job-1', jobName: 'Job 1', status: 'completed', startedAt: at(4), completedAt: null, duration: 5, error: 'not a failure' },
    ];
    const server = track(createHarness({
      '/api/v1/qcli/jobs': jobs,
      '/api/v1/qcli/jobs/executions': { items: runs, total: runs.length, limit: 100, offset: 0 },
    }));
    await server.open('/?tab=runs&result=failed');

    expect(await screen.findByText('took too long')).toBeTruthy();
    expect(screen.getByText('plain failure')).toBeTruthy();
    expect(screen.getByText('crashed')).toBeTruthy();
    expect(screen.queryByText('not a failure')).toBeNull();
    const urls = server.fetch.mock.calls.map(([u]) => String(u));
    expect(urls.some(u => u.startsWith('/api/v1/qcli/jobs/executions?') && u.includes('status='))).toBe(false);
  });

  it('shows every job status as a filter, also those no job has (dimmed), with counts', async () => {
    const server = track(createHarness({ '/api/v1/qcli/jobs': [...jobs, { ...jobs[0], id: 'job-p', name: 'Paused job', status: 'paused' }] }));
    await server.open('/');

    const group = await screen.findByRole('group', { name: 'Status' });
    const button = (name: RegExp) => within(group).getByRole('button', { name });
    expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['All 4', 'Active 3', 'Running 0', 'Paused 1', 'Stopped 0', 'Failing 0']);
    expect(button(/Stopped/).className).toContain('opacity-60');
    expect(button(/Paused/).className).not.toContain('opacity-60');

    fireEvent.click(button(/Paused/));
    expect(button(/Paused/).getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByText('Paused job')).toBeTruthy();
    expect(screen.queryByText('Job 0')).toBeNull();
    // An empty status can be picked too
    fireEvent.click(button(/Stopped/));
    expect(screen.queryByText('Paused job')).toBeNull();
  });

  it('filters the recent runs by status with buttons and counts', async () => {
    const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    const runs = [
      { id: 'r1', jobId: 'job-0', jobName: 'Job 0', status: 'failed', startedAt: at(1), completedAt: null, duration: 5, error: 'it broke' },
      { id: 'r2', jobId: 'job-0', jobName: 'Job 0', status: 'completed', startedAt: at(2), completedAt: null, duration: 5, error: null },
      { id: 'r3', jobId: 'job-1', jobName: 'Job 1', status: 'completed', startedAt: at(3), completedAt: null, duration: 5, error: null },
    ];
    const server = track(createHarness({
      '/api/v1/qcli/jobs': jobs,
      '/api/v1/qcli/jobs/executions': { items: runs, total: runs.length, limit: 100, offset: 0 },
    }));
    await server.open('/?tab=runs');

    expect(await screen.findByText('it broke')).toBeTruthy();
    const group = screen.getAllByRole('group', { name: 'Status' }).at(-1)!;
    expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['All 3', 'Succeeded 2', 'Failed 1', 'Cancelled 0', 'Running 0']);
    expect(within(group).getByRole('button', { name: /All/ }).getAttribute('aria-pressed')).toBe('true');

    const runRows = () => screen.queryAllByRole('row').length - 1;
    await waitFor(() => expect(runRows()).toBe(3));

    fireEvent.click(within(group).getByRole('button', { name: /Failed/ }));
    expect(screen.getByText('it broke')).toBeTruthy();
    expect(runRows()).toBe(1);
    expect(within(group).getByRole('button', { name: /Failed/ }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(within(group).getByRole('button', { name: /Succeeded/ }));
    // Succeeded runs are asked of the server (which filters them; this fake answers every run)
    await waitFor(() => expect(server.fetch.mock.calls.map(([u]) => String(u))
      .some(u => u.startsWith('/api/v1/qcli/jobs/executions?') && u.includes('status='))).toBe(true));
    expect(within(group).getByRole('button', { name: /Succeeded/ }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(within(group).getByRole('button', { name: /All/ }));
    await waitFor(() => expect(runRows()).toBe(3));
  });

  it('leaves the run counts out when only the latest runs are loaded', async () => {
    const run = { id: 'r1', jobId: 'job-0', jobName: 'Job 0', status: 'completed', startedAt: new Date().toISOString(), completedAt: null, duration: 5, error: 'one of many' };
    const server = track(createHarness({
      '/api/v1/qcli/jobs': jobs,
      '/api/v1/qcli/jobs/executions': { items: [run], total: 5000, limit: 100, offset: 0 },
    }));
    await server.open('/?tab=runs');

    expect(await screen.findByText('one of many')).toBeTruthy();
    const group = screen.getAllByRole('group', { name: 'Status' }).at(-1)!;
    expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['All', 'Succeeded', 'Failed', 'Cancelled', 'Running']);
  });

  it('groups each job\'s run controls: Resume when paused, only the actions the job offers', async () => {
    const server = track(createHarness({
      '/api/v1/qcli/jobs': [
          { ...jobs[0], name: 'Active job' },
          { ...jobs[1], name: 'Paused job', status: 'paused' },
          { ...jobs[2], name: 'Trigger only', actions: ['trigger'] },
        ],
    }));
    await server.open('/');

    const active = await screen.findByRole('group', { name: 'Actions for Active job' });
    expect(within(active).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Trigger', 'Pause', 'Stop']);
    const paused = screen.getByRole('group', { name: 'Actions for Paused job' });
    expect(within(paused).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Trigger', 'Resume', 'Stop']);
    const limited = screen.getByRole('group', { name: 'Actions for Trigger only' });
    expect(within(limited).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Trigger']);

    fireEvent.click(within(paused).getByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(server.requests).toContain('/api/v1/qcli/jobs/job-1/resume'));
  });

  it('shows a run\'s details on a bar of its last runs, loading them once, and opens the run on click', async () => {
    clearRunCache();
    const startedAt = new Date(Date.now() - 120_000).toISOString();
    const run = { id: 'r9', jobId: 'job-1', jobName: 'Job 1', status: 'failed', startedAt, completedAt: null, duration: 1200, error: 'bank timed out' };
    const full = { ...run, triggerType: 'schedule', retryAttempt: 1, logs: [{ timestamp: startedAt, level: 'error', message: 'GET /rates failed' }], properties: { items: 3 } };
    const server = track(createHarness({
      '/api/v1/qcli/jobs': jobs,
      '/api/v1/qcli/jobs/executions': { items: [run], total: 1, limit: 100, offset: 0 },
      '/api/v1/qcli/jobs/job-1': jobs[1],
      '/api/v1/qcli/jobs/job-1/history': { items: [full], total: 1, limit: 20, offset: 0 },
      '/api/v1/qcli/jobs/job-1/history/r9': full,
    }));
    await server.open('/');

    const bar = await screen.findByRole('link', { name: /^Run of .*: Failed, 1\.2s$/ });
    expect(bar.getAttribute('href')).toBe(`${PAGE_URL}/job-1?run=r9`);
    const fetched = () => server.requests.filter(path => path === '/api/v1/qcli/jobs/job-1/history/r9').length;

    // Hover: what the bar knows at once, then the run's details
    fireEvent.pointerEnter(bar.parentElement!);
    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).getByText('Failed')).toBeTruthy();
    expect(await within(tooltip).findByText('bank timed out')).toBeTruthy();
    expect(within(tooltip).getByText('GET /rates failed')).toBeTruthy();
    expect(within(tooltip).getByText('items=3')).toBeTruthy();
    expect(bar.getAttribute('aria-describedby')).toBe(tooltip.id);
    fireEvent.pointerLeave(bar.parentElement!);
    expect(screen.queryByRole('tooltip')).toBeNull();

    // Again, by keyboard: shown from the cache
    fireEvent.focus(bar);
    expect(within(screen.getByRole('tooltip')).getByText('bank timed out')).toBeTruthy();
    fireEvent.blur(bar);
    expect(fetched()).toBe(1);

    // Click: the job's page with the run's details open
    fireEvent.click(bar);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(await within(screen.getByRole('dialog')).findByText('GET /rates failed', { exact: false })).toBeTruthy();
  });
});

describe('jobs page long tag lists', () => {
  const TAGS = ['rates', 'mail', 'nightly', 'eu', 'billing', 'critical'];
  const job = {
    id: 'job-t', name: 'Sync rates', description: '', group: 'rates', status: 'active', schedule: null, interval: 60_000, enabled: true,
    lastRunAt: null, nextRunAt: null, lastRunDuration: null, overlapPolicy: 'skip', timeout: null, maxRetries: 0, tags: TAGS,
  };

  it('shows three tags in the table, +3 more opens “Tags of job Sync rates” with all of them, without opening the job', async () => {
    const server = track(createHarness({ '/api/v1/qcli/jobs': [job] }));
    await server.open('/');
    const row = (await screen.findByText('Sync rates')).closest('tr')!;
    const tags = within(row).getByRole('list', { name: 'Tags' });
    expect(within(tags).getAllByRole('listitem').map(li => li.textContent)).toEqual(['#rates', '#mail', '#nightly', '+3 more']);
    fireEvent.click(within(tags).getByRole('button', { name: '+3 more' }));
    const dialog = screen.getByRole('dialog', { name: 'Tags of job Sync rates' });
    expect(within(dialog).getAllByRole('listitem').map(li => li.textContent)).toEqual(TAGS.map(tag => `#${tag}`));
    fireEvent.click(dialog);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Still on the list: the row did not navigate
    expect(server.path).toBe('/');
    server.close();
  });
});
