// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { DashboardExtension } from '@qodalis/cli-server-dashboard-kit';
import OverviewPage from './OverviewPage';
import { loadExtension } from '../extension/loadExtension';
import { AuthProvider } from '../../context/AuthContext';
import { ExtensionsProvider } from '../../context/ExtensionsContext';
import { WebSocketProvider } from '../../context/WebSocketContext';
import { RestartProvider } from '../../context/RestartContext';
import { I18nProvider } from '../../i18n';
import { setToken } from '../../api/client';
import { FakeWebSocket, json } from '../../test/fakes';

vi.mock('../extension/loadExtension', async original => ({
  ...(await original<typeof import('../extension/loadExtension')>()),
  loadExtension: vi.fn(),
}));

const JOBS = { id: 'jobs', title: 'Jobs', entry: '/jobs.js', widgets: ['overview'] };

const STATUS = {
  uptimeSeconds: 3700, startedAt: '2026-11-25T09:00:00.000Z', memoryUsageMb: 12.5, cpuUsagePercent: 1,
  platform: 'node', platformVersion: '22', activeWsConnections: 2, activeShellSessions: 0, registeredCommands: 7, os: 'linux',
};
const CAPS = { os: 'linux', platform: 'node', version: '1.0.0', shell: false, features: [] };
const HISTORY = { samples: [{ timestamp: '2026-11-25T10:00:00.000Z', memoryMb: 12, cpuPercent: 1, activeWsConnections: 2, activeShellSessions: 0 }] };

/** Requests held until the test answers them, by path (without the query). */
let held: Map<string, Array<() => void>>;
/** Paths answered at once (everything else waits in `held`), and their answers. */
let answers: Record<string, () => Response>;

function hold(path: string) {
  delete answers[path];
}
function release(path: string, response: () => Response) {
  answers[path] = response;
  for (const resolve of held.get(path) ?? []) resolve();
  held.delete(path);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  setToken('tok');
  FakeWebSocket.install();
  held = new Map();
  answers = {
    '/api/v1/qcli/auth/mode': () => json({ mode: 'password' }),
    '/api/v1/qcli/auth/me': () => json({ username: 'root', authenticatedAt: '' }),
    '/api/v1/qcli/dashboard/extensions': () => json({ extensions: [] }),
    '/api/v1/qcli/sessions/current': () => json({ user: { id: 'u1', name: 'root' }, permissions: ['*'] }),
    '/api/v1/qcli/sessions/ws-ticket': () => json({ error: 'not found' }, 404),
    '/api/v1/qcli/status': () => json(STATUS),
    '/api/v1/qcli/capabilities': () => json(CAPS),
    '/api/v1/qcli/status/history': () => json(HISTORY),
    '/api/v1/qcli/logs': () => json({ entries: [], total: 0 }),
  };
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const path = String(input).split('?')[0];
    const answer = () => (answers[path] ?? (() => json({ error: 'not found' }, 404)))();
    if (path in answers || !['/api/v1/qcli/status', '/api/v1/qcli/capabilities', '/api/v1/qcli/status/history', '/api/v1/qcli/logs'].includes(path)) {
      return Promise.resolve(answer());
    }
    return new Promise<Response>(resolve => held.set(path, [...(held.get(path) ?? []), () => resolve(answer())]));
  }));
  vi.mocked(loadExtension).mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderOverview() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <ExtensionsProvider>
            <WebSocketProvider><OverviewPage /></WebSocketProvider>
          </ExtensionsProvider>
        </AuthProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

const attention = () => screen.getByText('Needs attention').closest('section')!;
const ALL_CLEAR = 'All clear: no failing jobs and no recent errors.';

describe('Overview loading', () => {
  it('holds the places of the stat cards, server info, resource charts and attention list until the server answers', async () => {
    for (const path of ['/api/v1/qcli/status', '/api/v1/qcli/capabilities', '/api/v1/qcli/status/history', '/api/v1/qcli/logs']) hold(path);
    renderOverview();

    await waitFor(() => expect(held.size).toBe(4));
    // Stat cards, server info, resources and attention: four loading statuses, no "—" values
    expect(screen.getAllByRole('status')).toHaveLength(4);
    expect(screen.queryByText('Uptime')).toBeNull();
    expect(screen.queryByText('—')).toBeNull();
    expect(within(attention()).getByRole('status')).toBeTruthy();
    expect(screen.queryByText(ALL_CLEAR)).toBeNull();
    // The resource charts' place has their 100px plots
    expect(document.querySelectorAll('.h-\\[100px\\]')).toHaveLength(3);

    await act(async () => {
      release('/api/v1/qcli/status', () => json(STATUS));
      release('/api/v1/qcli/capabilities', () => json(CAPS));
      release('/api/v1/qcli/status/history', () => json(HISTORY));
      release('/api/v1/qcli/logs', () => json({ entries: [], total: 0 }));
    });

    expect(await screen.findByText('Uptime')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('Server resources')).toBeTruthy();
    expect(screen.getByText(ALL_CLEAR)).toBeTruthy();
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  it('shows "All clear" only once the error log has answered', async () => {
    hold('/api/v1/qcli/logs');
    renderOverview();
    expect(await screen.findByText('Uptime')).toBeTruthy();
    expect(screen.queryByText(ALL_CLEAR)).toBeNull();
    expect(within(attention()).getByRole('status')).toBeTruthy();

    await act(async () => release('/api/v1/qcli/logs', () => json({ entries: [{ timestamp: '2026-11-25T10:00:00.000Z', level: 'ERROR', message: 'disk failed' }] })));
    expect(await screen.findByText('disk failed')).toBeTruthy();
    expect(screen.queryByText(ALL_CLEAR)).toBeNull();
    // The error opens Logs on that entry, not on every error
    const href = screen.getByText('disk failed').closest('a')!.getAttribute('href')!;
    const params = new URL(href, 'http://x').searchParams;
    expect(params.get('level')).toBe('ERROR');
    expect(params.get('range')).toBe('custom');
    expect(params.get('at')).toBe('2026-11-25T10:00:00.000Z');
  });

  it('leaves the error log out for a user without logs:read (the logs page is not theirs)', async () => {
    answers['/api/v1/qcli/sessions/current'] = () => json({ user: { id: 'u2', name: 'bob' }, permissions: ['admin:access'] });
    renderOverview();
    expect(await screen.findByText(ALL_CLEAR)).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).startsWith('/api/v1/qcli/logs'))).toBe(false);
  });

  it('shows "All clear" only once every module has answered its attention check', async () => {
    let answerAttention!: (items: []) => void;
    const module: DashboardExtension = {
      mount: () => {},
      overview: { attention: () => new Promise(resolve => { answerAttention = resolve; }) },
    };
    answers['/api/v1/qcli/dashboard/extensions'] = () => json({ extensions: [JOBS] });
    vi.mocked(loadExtension).mockResolvedValue(module);
    renderOverview();

    expect(await screen.findByText('Uptime')).toBeTruthy();
    await waitFor(() => expect(answerAttention).toBeTypeOf('function'));
    expect(screen.queryByText(ALL_CLEAR)).toBeNull();

    await act(async () => answerAttention([]));
    expect(await screen.findByText(ALL_CLEAR)).toBeTruthy();
  });

  it("holds a module card's place until the module has mounted it", async () => {
    let finishMount!: () => void;
    const module: DashboardExtension = {
      mount: () => {},
      overview: {
        cards: [{
          id: 'runs', size: 'half',
          mount: el => new Promise<void>(resolve => { el.textContent = 'Runs chart'; finishMount = resolve; }),
        }],
      },
    };
    answers['/api/v1/qcli/dashboard/extensions'] = () => json({ extensions: [JOBS] });
    vi.mocked(loadExtension).mockResolvedValue(module);
    renderOverview();

    await waitFor(() => expect(finishMount).toBeTypeOf('function'));
    // A chart-card skeleton named after the module
    expect(screen.getByText('Jobs', { selector: '.sr-only' }).closest('[role=status]')).toBeTruthy();
    expect((document.querySelector('[data-extension-card="jobs:runs"]') as HTMLElement).hidden).toBe(true);

    await act(async () => finishMount());
    expect(screen.queryByText('Jobs', { selector: '.sr-only' })).toBeNull();
    expect((document.querySelector('[data-extension-card="jobs:runs"]') as HTMLElement).hidden).toBe(false);
    expect(screen.getByText('Runs chart')).toBeTruthy();
  });
});

describe('Overview server info failure', () => {
  it('says so with Retry, and Retry loads it', async () => {
    let fail = true;
    answers['/api/v1/qcli/capabilities'] = () => (fail ? json({ error: 'down' }, 500) : json(CAPS));
    renderOverview();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Unable to load server info.');
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('OS')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Overview memory', () => {
  const memoryRow = async () => (await screen.findByText('12.5 MB')).closest('div')!;

  it('the process memory with the machine total and how much of it is used', async () => {
    answers['/api/v1/qcli/status'] = () => json({ ...STATUS, systemMemoryTotalMb: 16384, systemMemoryUsedMb: 10035, memoryLimited: false });
    renderOverview();
    expect((await memoryRow()).textContent).toContain('of 16 GB · machine 61% used');
  });

  it('the container limit and its usage when limited', async () => {
    answers['/api/v1/qcli/status'] = () => json({ ...STATUS, systemMemoryTotalMb: 512, systemMemoryUsedMb: 300, memoryLimited: true });
    renderOverview();
    expect((await memoryRow()).textContent).toContain('container limit 512 MB · 59% used');
  });

  it('the process memory alone when the server does not report the machine memory', async () => {
    answers['/api/v1/qcli/status'] = () => json({ ...STATUS, systemMemoryTotalMb: null, systemMemoryUsedMb: null, memoryLimited: null });
    renderOverview();
    await memoryRow();
    expect(screen.queryByTestId('system-memory')).toBeNull();
  });
});

describe('Overview server information: Restart server', () => {
  function renderWithRestart() {
    return render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider>
            <WebSocketProvider>
              <ExtensionsProvider>
                <RestartProvider><OverviewPage /></RestartProvider>
              </ExtensionsProvider>
            </WebSocketProvider>
          </AuthProvider>
        </MemoryRouter>
      </I18nProvider>,
    );
  }
  const serverInfo = async () => (await screen.findByText('Server information')).parentElement!.parentElement!;
  /** The restart status and the session (permissions) have answered. */
  const restartLoaded = () => waitFor(() => {
    const paths = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(paths.filter(p => p === '/api/v1/qcli/server/restart').length).toBeGreaterThan(0);
    expect(paths.filter(p => p === '/api/v1/qcli/sessions/current').length).toBeGreaterThan(0);
  }).then(() => act(async () => {}));
  const restartStatus = (supported: boolean) => () => json({ supported, mode: 'exit', supervisor: 'docker', startedAt: STATUS.startedAt, pending: [] });

  it('opens the restart confirmation from the server information card', async () => {
    answers['/api/v1/qcli/server/restart'] = restartStatus(true);
    renderWithRestart();
    const button = await within(await serverInfo()).findByRole('button', { name: /Restart server/ });
    fireEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: 'Restart the server?' });
    expect(within(dialog).getByText('No changes are waiting for a restart.')).toBeTruthy();
  });

  it('is not offered when the server cannot restart itself or the user lacks server:restart', async () => {
    answers['/api/v1/qcli/server/restart'] = restartStatus(false);
    renderWithRestart();
    await screen.findByText('linux');
    await restartLoaded();
    expect(within(await serverInfo()).queryByRole('button', { name: /Restart server/ })).toBeNull();
    cleanup();

    answers['/api/v1/qcli/server/restart'] = restartStatus(true);
    answers['/api/v1/qcli/sessions/current'] = () => json({ user: { id: 'u1', name: 'root' }, permissions: ['admin:access'] });
    renderWithRestart();
    await screen.findByText('linux');
    await restartLoaded();
    expect(within(await serverInfo()).queryByRole('button', { name: /Restart server/ })).toBeNull();
  });
});

describe('Overview versions', () => {
  it("shows the dashboard's own version next to the server's", async () => {
    renderOverview();
    const row = (await screen.findByTestId('dashboard-version')).closest('div')!;
    expect(row.textContent).toContain('Dashboard');
    expect(row.textContent).toContain(__DASHBOARD_VERSION__);
    expect(__DASHBOARD_VERSION__).toMatch(/^\d+\.\d+\.\d+/);
  });
});
