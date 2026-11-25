// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useEffect } from 'react';
import { RESTART_DISMISSED_KEY, RESTART_POLL_MS, RESTART_TIMEOUT_MS, RESTART_TOAST_MS, RestartProvider, useRestart } from './RestartContext';
import RestartBanner from '../components/RestartBanner';
import ConfigSectionCard from '../pages/config/ConfigSectionCard';
import { AuthProvider } from './AuthContext';
import { ExtensionsProvider } from './ExtensionsContext';
import { WebSocketProvider } from './WebSocketContext';
import { I18nProvider } from '../i18n';
import { navigation, setToken } from '../api/client';
import { FakeWebSocket, json } from '../test/fakes';
import type { ConfigSection, PendingRestartItem } from '../types';

const STARTED = '2026-11-25T09:00:00.000Z';
const RESTARTED = '2026-11-25T10:00:00.000Z';
const CORS: PendingRestartItem = { id: 'config:server.cors.mode', source: 'config', description: 'CORS mode changed', since: '2026-11-25T09:30:00.000Z' };
const PORT: PendingRestartItem = { id: 'config:server.http.port', source: 'config', description: 'Port changed', since: '2026-11-25T09:40:00.000Z' };

interface Server {
  /** The restart GET's answer; a number answers that status. */
  restart: Record<string, unknown> | number;
  /** POST answer status. */
  post: number;
  /** `/api/qcli/versions` answers (false: the server is down). */
  up: boolean;
  permissions: string[];
  requests: Array<{ method: string; path: string; body?: string }>;
}
let server: Server;

function status(over: Record<string, unknown> = {}) {
  return { supported: true, mode: 'exit', supervisor: 'docker', startedAt: STARTED, pending: [CORS, PORT], ...over };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-11-25T09:50:00.000Z'));
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  setToken('tok');
  FakeWebSocket.install();
  server = { restart: status(), post: 202, up: true, permissions: ['*'], requests: [] };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).split('?')[0];
    const method = init?.method ?? 'GET';
    server.requests.push({ method, path, body: typeof init?.body === 'string' ? init.body : undefined });
    if (path === '/api/qcli/versions') {
      if (!server.up) throw new TypeError('Failed to fetch');
      return json({ supportedVersions: [1], preferredVersion: 1 });
    }
    if (!server.up) throw new TypeError('Failed to fetch');
    switch (path) {
      case '/api/v1/qcli/auth/mode': return json({ mode: 'password' });
      case '/api/v1/qcli/auth/me': return json({ username: 'root', authenticatedAt: '' });
      case '/api/v1/qcli/dashboard/extensions': return json({ extensions: [] });
      case '/api/v1/qcli/sessions/current': return json({ user: { id: 'u1', name: 'root' }, permissions: server.permissions });
      case '/api/v1/qcli/server/restart':
        if (method === 'POST') return server.post === 202 ? json({ restarting: true }, 202) : json({ error: 'restart not supported: no supervisor detected; set restart.mode' }, server.post);
        return typeof server.restart === 'number' ? json({ error: 'nope' }, server.restart) : json(server.restart);
      default: return json({ error: 'not found' }, 404);
    }
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
/** Lets pending requests answer. */
async function settle() {
  for (let i = 0; i < 5; i++) await advance(0);
}

/** Counts mounts of the page, which the layout keys with the restart generation. */
let mounts = 0;
function Page() {
  useEffect(() => {
    mounts++;
  }, []);
  return <div>page</div>;
}
function Keyed() {
  const { generation } = useRestart();
  return <Page key={generation} />;
}

function Harness({ children }: { children?: React.ReactNode }) {
  return (
    <I18nProvider>
      <MemoryRouter>
        <AuthProvider>
          <WebSocketProvider>
            <ExtensionsProvider>
              <RestartProvider>
                <RestartBanner />
                <Keyed />
                {children}
              </RestartProvider>
            </ExtensionsProvider>
          </WebSocketProvider>
        </AuthProvider>
      </MemoryRouter>
    </I18nProvider>
  );
}

async function renderHarness(children?: React.ReactNode) {
  mounts = 0;
  const result = render(<Harness>{children}</Harness>);
  await settle();
  act(() => FakeWebSocket.live.forEach(ws => ws.readyState === FakeWebSocket.CONNECTING && ws.open()));
  return result;
}

const banner = () => screen.queryByRole('region', { name: /Restart required/ });
const socket = () => FakeWebSocket.live[FakeWebSocket.live.length - 1];
const count = (method: string, path: string) => server.requests.filter(r => r.method === method && r.path === path).length;

describe('Restart banner', () => {
  it('is hidden while nothing waits for a restart', async () => {
    server.restart = status({ pending: [] });
    await renderHarness();
    expect(banner()).toBeNull();
  });

  it('is hidden on servers without restarts (404) and for users who may not read it (403)', async () => {
    server.restart = 404;
    await renderHarness();
    expect(banner()).toBeNull();
    cleanup();
    server.restart = 403;
    await renderHarness();
    expect(banner()).toBeNull();
    expect(screen.getByText('page')).toBeTruthy();
  });

  it('counts the changes and lists them behind Details', async () => {
    await renderHarness();
    const region = banner()!;
    expect(within(region).getByText('Restart required: 2 changes take effect after a restart')).toBeTruthy();
    expect(within(region).queryByText('CORS mode changed')).toBeNull();

    const details = within(region).getByRole('button', { name: 'Details' });
    expect(details.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(details);
    expect(details.getAttribute('aria-expanded')).toBe('true');
    const list = within(region).getByRole('list', { name: 'Changes waiting for a restart' });
    expect(within(list).getByText('CORS mode changed')).toBeTruthy();
    expect(within(list).getByText('Port changed')).toBeTruthy();
    expect(within(list).getByText('20 minutes ago')).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: 'Hide details' }));
    expect(within(region).queryByRole('list')).toBeNull();
  });

  it('says one change in the singular', async () => {
    server.restart = status({ pending: [CORS] });
    await renderHarness();
    expect(within(banner()!).getByText('Restart required: 1 change takes effect after a restart')).toBeTruthy();
  });

  it('offers Restart server with server:restart on a server that can restart itself', async () => {
    server.permissions = ['admin:access', 'server:restart'];
    await renderHarness();
    expect(within(banner()!).getByRole('button', { name: 'Restart server' })).toBeTruthy();
    expect(screen.queryByTestId('restart-manual-hint')).toBeNull();
  });

  it('without server:restart: no button, the hint to restart by hand and why', async () => {
    server.permissions = ['admin:access'];
    await renderHarness();
    expect(within(banner()!).queryByRole('button', { name: 'Restart server' })).toBeNull();
    expect(screen.getByTestId('restart-manual-hint').textContent).toBe(
      'Restart the server to apply them. Restarting from here needs the server:restart permission.',
    );
  });

  it('on a server that cannot restart itself: no button, the hint and the reason', async () => {
    server.restart = status({ supported: false, mode: null, supervisor: null });
    await renderHarness();
    expect(within(banner()!).queryByRole('button', { name: 'Restart server' })).toBeNull();
    expect(screen.getByTestId('restart-manual-hint').textContent).toContain('The server cannot restart itself: no supervisor');
  });

  it('follows server:restart-required live: the list of the event, or the server\'s when it sends none', async () => {
    server.restart = status({ pending: [] });
    await renderHarness();
    expect(banner()).toBeNull();

    act(() => socket().emit({ type: 'server:restart-required', pending: [CORS] }));
    expect(within(banner()!).getByText('Restart required: 1 change takes effect after a restart')).toBeTruthy();

    server.restart = status({ pending: [CORS, PORT] });
    act(() => socket().emit({ type: 'server:restart-required' }));
    await settle();
    expect(within(banner()!).getByText('Restart required: 2 changes take effect after a restart')).toBeTruthy();

    act(() => socket().emit({ type: 'server:restart-required', pending: [] }));
    expect(banner()).toBeNull();
  });

  it('is dismissed for this tab until the list changes', async () => {
    const { unmount } = await renderHarness();
    fireEvent.click(within(banner()!).getByRole('button', { name: 'Dismiss' }));
    expect(banner()).toBeNull();
    expect(sessionStorage.getItem(RESTART_DISMISSED_KEY)).toBeTruthy();

    // Still dismissed after a reload of the page (same tab), the same changes in another order
    unmount();
    server.restart = status({ pending: [PORT, CORS] });
    await renderHarness();
    expect(banner()).toBeNull();

    // A new change brings it back
    const PLUGIN = { id: 'plugin:jobs', source: 'jobs', description: 'Jobs plugin updated', since: '' };
    act(() => socket().emit({ type: 'server:restart-required', pending: [CORS, PORT, PLUGIN] }));
    expect(within(banner()!).getByText('Restart required: 3 changes take effect after a restart')).toBeTruthy();
  });

  it('keeps working when session storage is blocked', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await renderHarness();
    fireEvent.click(within(banner()!).getByRole('button', { name: 'Dismiss' }));
    expect(banner()).toBeNull();
    spy.mockRestore();
  });
});

/** Opens the confirmation from the banner. */
function openConfirm() {
  fireEvent.click(within(banner()!).getByRole('button', { name: 'Restart server' }));
  return screen.getByRole('dialog', { name: 'Restart the server?' });
}
const overlay = () => screen.queryByRole('alertdialog');

describe('Restarting the server', () => {
  it('confirms with the pending changes and an optional reason, posts it and shows the overlay', async () => {
    await renderHarness();
    const dialog = openConfirm();
    const listed = within(dialog).getByTestId('restart-confirm-pending');
    expect(within(listed).getByText('CORS mode changed')).toBeTruthy();
    expect(within(listed).getByText('Port changed')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Reason (optional)'), { target: { value: 'apply CORS' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restart' }));
    await settle();

    const post = server.requests.find(r => r.method === 'POST' && r.path === '/api/v1/qcli/server/restart');
    expect(post?.body).toBe(JSON.stringify({ reason: 'apply CORS' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(overlay()!).getByText('Restarting the server…')).toBeTruthy();
  });

  it('cancelling posts nothing', async () => {
    await renderHarness();
    const dialog = openConfirm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await settle();
    expect(count('POST', '/api/v1/qcli/server/restart')).toBe(0);
    expect(overlay()).toBeNull();
  });

  it('keeps the dialog open with the server\'s reason when it cannot restart (409)', async () => {
    server.post = 409;
    await renderHarness();
    const dialog = openConfirm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restart' }));
    await settle();
    expect(within(dialog).getByText('restart not supported: no supervisor detected; set restart.mode')).toBeTruthy();
    expect(overlay()).toBeNull();
  });

  it('polls every second until the server is back as a new process, then reconnects, reloads and says so', async () => {
    await renderHarness();
    expect(mounts).toBe(1);
    const extensionLoads = count('GET', '/api/v1/qcli/dashboard/extensions');
    fireEvent.click(within(openConfirm()).getByRole('button', { name: 'Restart' }));
    await settle();
    expect(overlay()).toBeTruthy();

    // Still shutting down: answers as the old process
    await advance(RESTART_POLL_MS);
    await settle();
    expect(overlay()).toBeTruthy();

    // Down: the socket drops, nothing answers for a few seconds
    server.up = false;
    act(() => socket().drop(1012));
    const versionsBefore = count('GET', '/api/qcli/versions');
    await advance(3 * RESTART_POLL_MS);
    expect(count('GET', '/api/qcli/versions') - versionsBefore).toBe(3);
    expect(within(overlay()!).getByText('Restarting the server…')).toBeTruthy();

    // Back with a new start time
    server.up = true;
    server.restart = status({ startedAt: RESTARTED, pending: [] });
    const sockets = FakeWebSocket.instances.length;
    await advance(RESTART_POLL_MS);
    await settle();

    expect(overlay()).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Server restarted');
    expect(banner()).toBeNull();
    // The page mounted again, the extensions were reloaded and the socket reconnected at once
    expect(mounts).toBe(2);
    expect(count('GET', '/api/v1/qcli/dashboard/extensions')).toBeGreaterThan(extensionLoads);
    expect(FakeWebSocket.instances.length).toBeGreaterThan(sockets);

    // Polling stopped, the toast goes away
    const versions = count('GET', '/api/qcli/versions');
    await advance(RESTART_TOAST_MS);
    expect(count('GET', '/api/qcli/versions')).toBe(versions);
    expect(screen.queryByText('Server restarted')).toBeNull();
  });

  it('after two minutes says the server has not come back; Check again resumes, Reload reloads', async () => {
    await renderHarness();
    fireEvent.click(within(openConfirm()).getByRole('button', { name: 'Restart' }));
    await settle();
    server.up = false;

    await advance(RESTART_TIMEOUT_MS - 2 * RESTART_POLL_MS);
    expect(within(overlay()!).getByText('Restarting the server…')).toBeTruthy();
    await advance(3 * RESTART_POLL_MS);
    expect(within(overlay()!).getByText('The server has not come back')).toBeTruthy();

    // Polling stopped
    const versions = count('GET', '/api/qcli/versions');
    await advance(10 * RESTART_POLL_MS);
    expect(count('GET', '/api/qcli/versions')).toBe(versions);

    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    fireEvent.click(within(overlay()!).getByRole('button', { name: 'Reload page' }));
    expect(reload).toHaveBeenCalled();

    // Check again: at once, and back
    server.up = true;
    server.restart = status({ startedAt: RESTARTED, pending: [] });
    fireEvent.click(within(overlay()!).getByRole('button', { name: 'Check again' }));
    expect(within(overlay()!).getByText('Restarting the server…')).toBeTruthy();
    await settle();
    expect(overlay()).toBeNull();
    expect(screen.getByText('Server restarted')).toBeTruthy();
  });

  it('Check again while still down goes back to waiting for another two minutes', async () => {
    await renderHarness();
    fireEvent.click(within(openConfirm()).getByRole('button', { name: 'Restart' }));
    await settle();
    server.up = false;
    await advance(RESTART_TIMEOUT_MS + RESTART_POLL_MS);
    fireEvent.click(within(overlay()!).getByRole('button', { name: 'Check again' }));
    await settle();
    expect(within(overlay()!).getByText('Restarting the server…')).toBeTruthy();
    await advance(RESTART_TIMEOUT_MS / 2);
    expect(within(overlay()!).getByText('Restarting the server…')).toBeTruthy();
    await advance(RESTART_TIMEOUT_MS / 2 + RESTART_POLL_MS);
    expect(within(overlay()!).getByText('The server has not come back')).toBeTruthy();
  });

  it('a socket closed with 1012 (another admin restarted it) shows the overlay until the server is back', async () => {
    server.permissions = ['admin:access'];
    await renderHarness();
    server.up = false;
    act(() => socket().drop(1012));
    expect(within(overlay()!).getByText('Restarting the server…')).toBeTruthy();
    await advance(2 * RESTART_POLL_MS);
    expect(overlay()).toBeTruthy();

    server.up = true;
    server.restart = status({ startedAt: RESTARTED, pending: [] });
    await advance(RESTART_POLL_MS);
    await settle();
    expect(overlay()).toBeNull();
    expect(screen.getByText('Server restarted')).toBeTruthy();
  });

  it('other close codes (a network drop) do not', async () => {
    await renderHarness();
    act(() => socket().drop(1006));
    expect(overlay()).toBeNull();
  });

  it('server:restarting shows the overlay too', async () => {
    await renderHarness();
    act(() => socket().emit({ type: 'server:restarting' }));
    expect(within(overlay()!).getByText('Restarting the server…')).toBeTruthy();
  });

  it('counts a server that no longer knows the session (401) as back, and the reload goes to sign-in', async () => {
    const toSignIn = vi.spyOn(navigation, 'toSignIn').mockImplementation(() => {});
    await renderHarness();
    act(() => socket().emit({ type: 'server:restarting' }));
    server.restart = 401;
    await advance(RESTART_POLL_MS);
    await settle();
    expect(overlay()).toBeNull();
    expect(toSignIn).toHaveBeenCalled();
    toSignIn.mockRestore();
  });
});

describe('Pending-restart markers on the Config page', () => {
  const SECTION: ConfigSection = {
    id: 'cors', title: 'CORS', description: '', mutable: true, version: '1', allowCustomKeys: false,
    entries: [
      { key: 'mode', label: 'Mode', description: '', type: 'string', value: 'list', default: 'any', source: 'runtime', mutable: true, requiresRestart: true, sensitive: false },
      { key: 'origins', label: 'Origins', description: '', type: 'string', value: '', default: '', source: 'default', mutable: true, requiresRestart: true, sensitive: false },
      { key: 'maxAge', label: 'Max age', description: '', type: 'number', value: 5, default: 5, source: 'default', mutable: true, requiresRestart: false, sensitive: false },
    ],
  };
  const card = (
    <ConfigSectionCard
      providerId="server" writable section={SECTION} added={[]} edits={{}} serverErrors={{}} query="" saving={false}
      stale={false} conflict={false} editors={new Map()} onEdit={() => {}} onAddKey={() => {}} onReload={() => {}}
    />
  );
  const row = (key: string) => document.querySelector(`[data-config-key="${key}"]`) as HTMLElement;

  it('marks changed entries that wait for a restart, live, until the server restarted', async () => {
    server.restart = status({ pending: [] });
    await renderHarness(card);
    expect(row('mode').querySelector('[data-pending-restart]')).toBeNull();
    expect(within(row('mode')).getByText('Restart required')).toBeTruthy();

    act(() => socket().emit({ type: 'server:restart-required', pending: [CORS] }));
    expect(within(row('mode')).getByText(/Pending restart/)).toBeTruthy();
    expect(row('mode').querySelector('[data-pending-restart]')?.getAttribute('title')).toBe('Changed: takes effect after the server restarts');
    expect(row('origins').querySelector('[data-pending-restart]')).toBeNull();
    expect(row('maxAge').querySelector('[data-pending-restart]')).toBeNull();

    act(() => socket().emit({ type: 'server:restart-required', pending: [] }));
    expect(row('mode').querySelector('[data-pending-restart]')).toBeNull();
  });
});
