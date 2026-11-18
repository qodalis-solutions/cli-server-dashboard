// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from './App';
import { I18nProvider } from './i18n';
import { getToken, navigation, setToken } from './api/client';
import { consumeFragmentToken } from './api/signIn';
import { FakeWebSocket, installFakeServer, json } from './test/fakes';

// The embedded CLI (xterm.js) needs a real browser; the gate in front of it is what's tested here.
vi.mock('./pages/terminal/TerminalPage', () => ({ default: () => <div>embedded terminal</div> }));

function renderApp(path = '/') {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </I18nProvider>,
  );
}

const sidebar = () => screen.getByRole('navigation');

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  window.history.replaceState(null, '', '/qcli/admin/');
  FakeWebSocket.install();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sign-in mode', () => {
  it('shows the password form when /auth/mode answers 404 (older server)', async () => {
    installFakeServer({ mode: new Response('Not Found', { status: 404 }) });
    renderApp('/login');
    expect(await screen.findByPlaceholderText('admin')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('shows the password form when /auth/mode fails to load', async () => {
    installFakeServer({ mode: 'network-error' });
    renderApp('/login');
    expect(await screen.findByPlaceholderText('admin')).toBeTruthy();
  });

  it('external mode: "Sign in at <signInUrl>" and Retry instead of the password form', async () => {
    installFakeServer({ mode: json({ mode: 'external', signInUrl: 'https://app.example.com/sign-in' }) });
    renderApp('/login');

    const link = await screen.findByRole('link', { name: 'Sign in at https://app.example.com/sign-in' });
    expect(link.getAttribute('href')).toBe(`https://app.example.com/sign-in?returnTo=${encodeURIComponent(`${window.location.origin}/qcli/admin/`)}`);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByPlaceholderText('admin')).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it('external mode without a sign-in URL tells users to sign in through the host app', async () => {
    installFakeServer({ mode: json({ mode: 'external', signInUrl: null }) });
    renderApp('/login');
    expect(await screen.findByText('Sign in through the host application, then retry.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it('signed-out users of an external server land on the host sign-in screen', async () => {
    installFakeServer({ mode: json({ mode: 'external', signInUrl: '/sign-in' }) });
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Sign in at /sign-in' })).toBeTruthy();
  });

  it('Retry signs in once the host session exists', async () => {
    const server = installFakeServer({ mode: json({ mode: 'external', signInUrl: '/sign-in' }) });
    renderApp('/login');
    const retry = await screen.findByRole('button', { name: 'Retry' });

    fireEvent.click(retry);
    expect(await screen.findByRole('alert')).toBeTruthy(); // still signed out

    server.hostSession = true;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('alice')).toBeTruthy(); // dashboard sidebar
  });

  it('a 501 EXTERNAL_AUTH login answer switches to the host sign-in screen', async () => {
    installFakeServer({
      mode: new Response('Not Found', { status: 404 }),
      login: () => json({ error: 'Sign-in is managed by the host application.', code: 'EXTERNAL_AUTH', signInUrl: '/sign-in' }, 501),
    });
    renderApp('/login');
    fireEvent.change(await screen.findByPlaceholderText('admin'), { target: { value: 'admin' } });
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('link', { name: 'Sign in at /sign-in' })).toBeTruthy();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});

describe('host handoff (#token=)', () => {
  it('signs in with the host token from the fragment and removes it from the URL', async () => {
    const server = installFakeServer({ mode: json({ mode: 'external', signInUrl: '/sign-in' }), validToken: 'host.jwt' });
    window.history.replaceState(null, '', '/qcli/admin/#token=host.jwt');

    consumeFragmentToken(); // main.tsx, before the first render
    expect(window.location.hash).toBe('');
    expect(getToken()).toBe('host.jwt');

    renderApp('/');
    expect(await screen.findByText('alice')).toBeTruthy();
    expect(server.requests).toContain('/api/v1/qcli/auth/me');
    const me = vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/v1/qcli/auth/me')!;
    expect((me[1]!.headers as Record<string, string>).Authorization).toBe('Bearer host.jwt');
  });
});

describe('host handoff into the open page', () => {
  it('signs in when the host returns with #token= without a reload', async () => {
    installFakeServer({ mode: json({ mode: 'external', signInUrl: '/sign-in' }), validToken: 'host.jwt' });
    renderApp('/login');
    await screen.findByRole('link', { name: 'Sign in at /sign-in' });

    act(() => {
      window.history.replaceState(null, '', '/qcli/admin/login#token=host.jwt');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByText('alice')).toBeTruthy();
    expect(window.location.hash).toBe('');
    expect(getToken()).toBe('host.jwt');
  });
});

describe('401 while signed in', () => {
  it('drops the token and goes to sign-in, which shows the host sign-in in external mode', async () => {
    const server = installFakeServer({ mode: json({ mode: 'external', signInUrl: '/sign-in' }) });
    setToken('good-token');
    const toSignIn = vi.spyOn(navigation, 'toSignIn').mockImplementation(() => {});
    renderApp('/');
    expect(await screen.findByText('alice')).toBeTruthy();

    // The host session expires: the next API call answers 401
    server.validToken = null;
    fireEvent.click(within(sidebar()).getByRole('link', { name: /Config/ }));
    await waitFor(() => expect(toSignIn).toHaveBeenCalled());
    expect(getToken()).toBeNull();

    // The sign-in page (reloaded by the redirect) shows the host sign-in, not the form
    cleanup();
    renderApp('/login');
    expect(await screen.findByRole('link', { name: 'Sign in at /sign-in' })).toBeTruthy();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});

describe('events socket', () => {
  it('on a phone the navigation collapses into a menu, closed by a link, the backdrop or Escape', async () => {
    installFakeServer();
    setToken('good-token');
    renderApp('/');
    expect(await screen.findByText('alice')).toBeTruthy();
    const menu = screen.getByRole('button', { name: 'Open menu' });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Close menu' })).toBeNull();

    fireEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(within(sidebar()).getByRole('link', { name: /Config/ }));
    await screen.findByRole('heading', { level: 2, name: /Config/ });
    expect(menu.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(menu);
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(menu.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(menu);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps a single socket across route changes', async () => {
    installFakeServer({ enabledFeatures: ['jobs', 'filesystem'] });
    setToken('good-token');
    renderApp('/');
    expect(await screen.findByText('alice')).toBeTruthy();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    act(() => FakeWebSocket.instances[0].open());

    for (const name of ['Commands', 'Events', 'Jobs', 'Plugins', 'Logs', 'Config', 'Overview', 'Events']) {
      fireEvent.click(within(sidebar()).getByRole('link', { name: new RegExp(name) }));
      await screen.findByRole('heading', { level: 2, name: new RegExp(name) });
    }

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0].readyState).toBe(FakeWebSocket.OPEN);
    expect(FakeWebSocket.instances[0].url).toContain('/ws/v1/qcli/events');
  });

  it('opens no socket while signed out', async () => {
    installFakeServer();
    renderApp('/login');
    await screen.findByPlaceholderText('admin');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});

describe('feature gating', () => {
  it('hides Filesystem and Jobs when the server lacks them, but always shows the Terminal', async () => {
    installFakeServer({ enabledFeatures: [], shell: false });
    setToken('good-token');
    renderApp('/');
    await screen.findByText('alice');
    await within(sidebar()).findByRole('link', { name: /Overview/ });
    // Wait for the features to load (the gated items are hidden while loading too)
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([u]) => u === '/api/v1/qcli/plugins')).toBe(true));

    const nav = within(sidebar());
    for (const name of ['Filesystem', 'Jobs']) expect(nav.queryByRole('link', { name: new RegExp(name) })).toBeNull();
    expect(nav.getByRole('link', { name: /Events/ })).toBeTruthy();
    // The terminal is the web CLI over the server's commands, not an OS shell
    expect(nav.getByRole('link', { name: /Terminal/ })).toBeTruthy();
  });

  it('shows them when capabilities and status report the features', async () => {
    installFakeServer({ enabledFeatures: ['jobs', 'filesystem'], shell: true });
    setToken('good-token');
    renderApp('/');
    const nav = within(await screen.findByRole('navigation'));
    for (const name of ['Terminal', 'Filesystem', 'Jobs']) expect(await nav.findByRole('link', { name: new RegExp(name) })).toBeTruthy();
  });

  it('shows Audit only when the server reports the audit feature', async () => {
    installFakeServer({ enabledFeatures: ['audit'] });
    setToken('good-token');
    renderApp('/');
    const nav = within(await screen.findByRole('navigation'));
    expect(await nav.findByRole('link', { name: /Audit/ })).toBeTruthy();
  });

  it.each([
    ['/filesystem', 'Filesystem'],
    ['/jobs', 'Jobs'],
    ['/audit', 'Audit'],
  ])('a direct link to %s says "Not enabled on this server"', async (path, title) => {
    installFakeServer({ enabledFeatures: [], shell: false });
    setToken('good-token');
    renderApp(path);
    expect(await screen.findByText('Not enabled on this server')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeTruthy();
  });
});

describe('audit page', () => {
  it('lists entries with who, about what and their values, charts them, and filters by actor', async () => {
    const hourAgo = Date.now() - 3_600_000;
    const server = installFakeServer({
      enabledFeatures: ['audit'],
      audit: [
        {
          id: 'a1', timestamp: hourAgo, event: 'role.save', username: '', actor: 'admin@example.com',
          target: 'role:editor', properties: { permissions: ['jobs.view'], count: 2 },
          metadata: { remoteAddress: '10.0.0.1' },
        },
        { id: 'a2', timestamp: hourAgo - 60_000, event: 'login_failed', username: 'bob', details: 'wrong password' },
      ],
    });
    setToken('good-token');
    renderApp('/audit');

    // In the table and in the most frequent events and users
    expect((await screen.findAllByText('role.save')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('admin@example.com').length).toBe(2);
    expect(screen.getByText('role:editor')).toBeTruthy();
    expect(screen.getByText('permissions=["jobs.view"]')).toBeTruthy();
    expect(screen.getByText('count=2')).toBeTruthy();
    expect(screen.getByText('10.0.0.1')).toBeTruthy();
    expect(screen.getByText('wrong password')).toBeTruthy();
    expect(screen.getByText('Activity')).toBeTruthy();

    // The range's entries, as many as the server sends at once
    const first = vi.mocked(fetch).mock.calls.map(([u]) => String(u)).find(u => u.startsWith('/api/v1/qcli/audit'));
    expect(first).toMatch(/^\/api\/v1\/qcli\/audit\?from=[^&]+&limit=1000$/);

    fireEvent.change(screen.getByLabelText('By (user)'), { target: { value: ' admin@example.com ' } });
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.map(([u]) => String(u))
      .some(u => u.startsWith('/api/v1/qcli/audit?actor=admin%40example.com&from='))).toBe(true));
    expect(server.requests).toContain('/api/v1/qcli/audit');
  });
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
    installFakeServer({
      enabledFeatures: ['jobs'],
      routes: {
        '/api/v1/qcli/jobs': [job({ id: 'fetch-rates', name: 'Fetch rates' }), prune],
        '/api/v1/qcli/jobs/jobs%3Aprune-history/history': { items: [pruneRun], total: 1, limit: 1, offset: 0 },
      },
    });
    setToken('good-token');
    renderApp('/jobs');

    const link = (await screen.findByText('42 runs deleted')).closest('a')!;
    expect(link.getAttribute('href')).toBe('/jobs/jobs%3Aprune-history');
    expect(within(link).getByText('History pruning')).toBeTruthy();
    expect(within(link).getByText('Last run 2 hours ago')).toBeTruthy();
    expect(within(link).getByText('completed')).toBeTruthy();
  });

  it('shows a job\'s limits and whether they are its own, and hides them on older servers', async () => {
    const retention = { maxAge: 30 * 86_400_000, maxRunsPerJob: 500, failedMaxAge: null, failedMaxRunsPerJob: 50, overridden: true, keepAll: false };
    installFakeServer({
      enabledFeatures: ['jobs'],
      routes: {
        '/api/v1/qcli/jobs/fetch-rates': job({ id: 'fetch-rates', name: 'Fetch rates', historyRetention: retention }),
        '/api/v1/qcli/jobs/fetch-rates/history': { items: [], total: 0, limit: 20, offset: 0 },
        '/api/v1/qcli/jobs/old': job({ id: 'old', name: 'Old server job' }),
        '/api/v1/qcli/jobs/old/history': { items: [], total: 0, limit: 20, offset: 0 },
      },
    });
    setToken('good-token');
    renderApp('/jobs/fetch-rates');

    expect(await screen.findByText('History Retention')).toBeTruthy();
    expect(screen.getByText('Overridden for this job')).toBeTruthy();
    expect(screen.getByText('30d')).toBeTruthy();
    expect(screen.getByText('500')).toBeTruthy();
    expect(screen.getByText('No limit')).toBeTruthy();
    expect(screen.getByText('50')).toBeTruthy();
    cleanup();

    renderApp('/jobs/old');
    expect((await screen.findAllByText('Old server job')).length).toBeGreaterThan(0);
    expect(screen.queryByText('History Retention')).toBeNull();
  });

  it('says a job without limits keeps its history forever', async () => {
    installFakeServer({
      enabledFeatures: ['jobs'],
      routes: {
        '/api/v1/qcli/jobs/fetch-rates': job({ id: 'fetch-rates', name: 'Fetch rates', historyRetention: null }),
        '/api/v1/qcli/jobs/fetch-rates/history': { items: [], total: 0, limit: 20, offset: 0 },
      },
    });
    setToken('good-token');
    renderApp('/jobs/fetch-rates');

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
    installFakeServer({ enabledFeatures: ['jobs'], routes: { '/api/v1/qcli/jobs': jobs } });
    setToken('good-token');
    renderApp('/jobs?q=job&group=rates');

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
    cleanup();

    renderApp('/jobs');
    expect((await screen.findByRole('button', { name: /Filters/ })).getAttribute('aria-expanded')).toBe('false');
  });

  it('shows the jobs or their recent runs, one tab at a time, kept in the URL', async () => {
    const run = {
      id: 'r1', jobId: 'job-1', jobName: 'Job 1', status: 'failed', startedAt: new Date(Date.now() - 60_000).toISOString(),
      completedAt: null, duration: 5, error: 'boom',
    };
    installFakeServer({
      enabledFeatures: ['jobs'],
      routes: {
        '/api/v1/qcli/jobs': jobs,
        '/api/v1/qcli/jobs/executions': { items: [run], total: 1, limit: 100, offset: 0 },
      },
    });
    setToken('good-token');
    renderApp('/jobs');

    const jobsTab = await screen.findByRole('tab', { name: /Jobs/ });
    expect(jobsTab.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText('Job 2')).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Recent runs/ }));
    expect(await screen.findByText('boom')).toBeTruthy();
    expect(screen.queryByText('Job 2')).toBeNull();
    cleanup();

    renderApp('/jobs?tab=runs');
    expect((await screen.findByRole('tab', { name: /Recent runs/ })).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText('boom')).toBeTruthy();
  });

  it('pages the jobs in the page and the runs on the server, remembering the page size', async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ ...jobs[0], id: `many-${i}`, name: `Many ${String(i).padStart(2, '0')}` }));
    const runs = Array.from({ length: 20 }, (_, i) => ({
      id: `r${i}`, jobId: 'many-0', jobName: 'Many 00', status: 'completed', startedAt: new Date(Date.now() - i * 60_000).toISOString(),
      completedAt: null, duration: 5, error: i === 0 ? 'first page' : null,
    }));
    installFakeServer({
      enabledFeatures: ['jobs'],
      routes: {
        '/api/v1/qcli/jobs': many,
        '/api/v1/qcli/jobs/executions': { items: runs, total: 950, limit: 20, offset: 0 },
      },
    });
    setToken('good-token');
    renderApp('/jobs');

    expect(await screen.findByText('Many 00')).toBeTruthy();
    expect(screen.queryByText('Many 20')).toBeNull();
    expect(screen.getByText('1–20 of 45')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Many 20')).toBeTruthy();
    expect(screen.queryByText('Many 00')).toBeNull();
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '50' } });
    expect(screen.getByText('Many 44')).toBeTruthy();
    expect(localStorage.getItem('qcli_admin_jobs_page_size')).toBe('50');

    // Runs: the total comes from the server, the next page is asked for by offset
    fireEvent.click(screen.getByRole('tab', { name: /Recent runs/ }));
    expect(await screen.findByText('1–20 of 950')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.map(([u]) => String(u))
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
    installFakeServer({
      enabledFeatures: ['jobs'],
      routes: {
        '/api/v1/qcli/jobs': jobs,
        '/api/v1/qcli/jobs/executions': { items: runs, total: runs.length, limit: 100, offset: 0 },
      },
    });
    setToken('good-token');
    renderApp('/jobs?tab=runs&result=failed');

    expect(await screen.findByText('took too long')).toBeTruthy();
    expect(screen.getByText('plain failure')).toBeTruthy();
    expect(screen.getByText('crashed')).toBeTruthy();
    expect(screen.queryByText('not a failure')).toBeNull();
    const urls = vi.mocked(fetch).mock.calls.map(([u]) => String(u));
    expect(urls.some(u => u.startsWith('/api/v1/qcli/jobs/executions?') && u.includes('status='))).toBe(false);
  });
});

describe('plugins page', () => {
  it('lists the installed server plugins above the command modules', async () => {
    installFakeServer({
      installedPlugins: [
        { id: 'Qodalis.Cli', name: 'Core', version: '1.0.0-beta.15', description: 'ASP.NET Core integration' },
        { id: 'Qodalis.Cli.Plugin.Users', name: 'Users', version: '1.0.0-beta.15', description: 'User management plugin' },
      ],
      plugins: [{ id: 'weather', name: 'weather', version: '1.0.0', description: 'Weather', enabled: true, processorCount: 1, processors: ['weather'] }],
    });
    setToken('good-token');
    renderApp('/plugins');

    expect(await screen.findByText('Server plugins')).toBeTruthy();
    expect(screen.getByText('Qodalis.Cli.Plugin.Users')).toBeTruthy();
    expect(screen.getByText('User management plugin')).toBeTruthy();
    expect(screen.getByText('Command modules')).toBeTruthy();
    expect(await screen.findByText('Weather')).toBeTruthy();
    expect(screen.getByText('2 installed plugins')).toBeTruthy();
  });

  it('shows only the command modules on servers that do not list installed plugins', async () => {
    installFakeServer({
      installedPlugins: undefined,
      plugins: [{ id: 'weather', name: 'weather', version: '1.0.0', description: 'Weather', enabled: true, processorCount: 1, processors: ['weather'] }],
    });
    setToken('good-token');
    renderApp('/plugins');

    expect(await screen.findByText('Weather')).toBeTruthy();
    expect(screen.queryByText('Server plugins')).toBeNull();
    expect(screen.queryByText(/Error/)).toBeNull();
  });
});
