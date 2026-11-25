// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
  defineExtension,
  useExtensionConfig,
  type DashboardExtension,
  type DashboardExtensionConfig,
  type DashboardExtensionContext,
} from '@qodalis/cli-server-dashboard-kit';
import ExtensionPage from './ExtensionPage';
import { loadExtension } from './loadExtension';
import { AuthProvider } from '../../context/AuthContext';
import { ExtensionsProvider } from '../../context/ExtensionsContext';
import { WebSocketProvider } from '../../context/WebSocketContext';
import { I18nProvider } from '../../i18n';
import { setToken } from '../../api/client';
import { FakeWebSocket, json } from '../../test/fakes';

vi.mock('./loadExtension', async original => ({
  ...(await original<typeof import('./loadExtension')>()),
  loadExtension: vi.fn(),
}));

const API = '/api/v1/qcli/dashboard/marketplace';
const KANBAN = { id: 'kanban', title: 'Kanban', entry: '/qcli/modules/kanban/extension.js', source: 'marketplace', package: '@acme/dashboard-kanban' };
const JOBS = { id: 'jobs', title: 'Jobs', entry: '/qcli/modules/jobs/extension.js' };

let extensions: unknown[];
let config: () => Response | Promise<Response>;
let installed: unknown[];
const requests: string[] = [];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  setToken('tok');
  FakeWebSocket.install();
  requests.length = 0;
  extensions = [KANBAN, JOBS];
  installed = [];
  config = () => json({ values: { refreshSeconds: 60, mode: 'full' }, version: 'v1' });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith('/auth/mode')) return json({ mode: 'password' });
    if (url.endsWith('/auth/me')) return json({ username: 'root', authenticatedAt: '' });
    if (url.endsWith('/sessions/ws-ticket')) return new Response('', { status: 404 });
    if (url.endsWith('/sessions/current')) return json({ user: { id: 'u1', name: 'root' }, permissions: ['*'] });
    if (url.endsWith('/dashboard/extensions')) return json({ extensions });
    if (url.endsWith('/config') && url.startsWith(`${API}/installed/`)) return config();
    if (url === `${API}/installed`) return json(installed);
    return json({ error: 'not found' }, 404);
  }));
  vi.mocked(loadExtension).mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPage(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <WebSocketProvider>
            <ExtensionsProvider>
              <Routes>
                <Route path="/x/:id/*" element={<ExtensionPage />} />
              </Routes>
            </ExtensionsProvider>
          </WebSocketProvider>
        </AuthProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

/** An extension recording the config it mounted with and every onConfigChange. */
function recordingExtension() {
  const seen = { mounted: [] as Array<DashboardExtensionConfig | undefined>, changes: [] as DashboardExtensionConfig[], context: null as DashboardExtensionContext | null };
  const extension: DashboardExtension = {
    mount(element, context) {
      seen.context = context;
      seen.mounted.push(context.config);
      element.innerHTML = `<p>mounted ${context.extension.id}</p>`;
      return context.onConfigChange?.(next => seen.changes.push(next));
    },
  };
  return { extension, seen };
}

const configRequests = () => requests.filter(r => r.endsWith('/config'));

async function openSocket() {
  await waitFor(() => expect(FakeWebSocket.live).toHaveLength(1));
  const socket = FakeWebSocket.live[0];
  act(() => socket.open());
  return socket;
}

describe('a marketplace extension’s settings', () => {
  it('are read before it mounts and passed as ctx.config', async () => {
    let answer: () => void = () => {};
    config = () => new Promise(resolve => { answer = () => resolve(json({ values: { refreshSeconds: 60 }, version: 'v1' })); });
    const { extension, seen } = recordingExtension();
    vi.mocked(loadExtension).mockResolvedValue(extension);
    renderPage('/x/kanban');

    await waitFor(() => expect(configRequests()).toEqual([`${API}/installed/%40acme%2Fdashboard-kanban/config`]));
    // The module is loaded, but waits for its settings
    await waitFor(() => expect(loadExtension).toHaveBeenCalled());
    expect(seen.mounted).toEqual([]);
    act(() => answer());
    expect(await screen.findByText('mounted kanban')).toBeTruthy();
    expect(seen.mounted).toEqual([{ refreshSeconds: 60 }]);
    expect(seen.context?.config).toEqual({ refreshSeconds: 60 });
  });

  it('find the package among the installed plugins when the server does not send it', async () => {
    extensions = [{ ...KANBAN, package: undefined }];
    installed = [{ name: '@acme/other', id: 'other', version: '1.0.0' }, { name: '@acme/kanban-board', id: 'kanban', version: '0.3.0' }];
    const { extension, seen } = recordingExtension();
    vi.mocked(loadExtension).mockResolvedValue(extension);
    renderPage('/x/kanban');
    expect(await screen.findByText('mounted kanban')).toBeTruthy();
    expect(configRequests()).toEqual([`${API}/installed/%40acme%2Fkanban-board/config`]);
    expect(seen.mounted).toEqual([{ refreshSeconds: 60, mode: 'full' }]);
  });

  it('follow config:changed of its section live (onConfigChange, ctx.config), and only that section', async () => {
    const { extension, seen } = recordingExtension();
    vi.mocked(loadExtension).mockResolvedValue(extension);
    renderPage('/x/kanban');
    expect(await screen.findByText('mounted kanban')).toBeTruthy();
    const socket = await openSocket();

    // Other sections and providers: nothing to read
    act(() => socket.emit({ type: 'config:changed', provider: 'dashboard-plugins', section: 'jobs', keys: ['x'], version: 'v2' }));
    act(() => socket.emit({ type: 'config:changed', provider: 'server', section: 'kanban', keys: ['x'], version: 'v2' }));
    expect(configRequests()).toHaveLength(1);

    config = () => json({ values: { refreshSeconds: 5, mode: 'full' }, version: 'v2' });
    act(() => socket.emit({ type: 'config:changed', provider: 'dashboard-plugins', section: 'kanban', keys: ['refreshSeconds'], version: 'v2' }));
    await waitFor(() => expect(seen.changes).toEqual([{ refreshSeconds: 5, mode: 'full' }]));
    expect(configRequests()).toHaveLength(2);
    expect(seen.context?.config).toEqual({ refreshSeconds: 5, mode: 'full' });

    // The same values again: no change to report
    act(() => socket.emit({ type: 'config:changed', provider: 'dashboard-plugins', section: 'kanban', keys: ['mode'], version: 'v3' }));
    await waitFor(() => expect(configRequests()).toHaveLength(3));
    expect(seen.changes).toHaveLength(1);
  });

  it('render again through useExtensionConfig() of a defineExtension page', async () => {
    vi.mocked(loadExtension).mockResolvedValue(defineExtension(() => {
      const settings = useExtensionConfig<{ refreshSeconds: number }>();
      return <p>{`refresh every ${settings?.refreshSeconds ?? 30}s`}</p>;
    }));
    renderPage('/x/kanban');
    expect(await screen.findByText('refresh every 60s')).toBeTruthy();
    const socket = await openSocket();
    config = () => json({ values: { refreshSeconds: 15 }, version: 'v2' });
    act(() => socket.emit({ type: 'config:changed', provider: 'dashboard-plugins', section: 'kanban', keys: ['refreshSeconds'], version: 'v2' }));
    expect(await screen.findByText('refresh every 15s')).toBeTruthy();
  });

  it('mount it with {} (its own defaults) and a notice when they cannot be read', async () => {
    config = () => json({ error: 'boom' }, 500);
    const { extension, seen } = recordingExtension();
    vi.mocked(loadExtension).mockResolvedValue(extension);
    renderPage('/x/kanban');
    expect(await screen.findByText('mounted kanban')).toBeTruthy();
    expect(seen.mounted).toEqual([{}]);
    expect(await screen.findByText('Could not load the settings of Kanban: it runs with its defaults.')).toBeTruthy();
  });

  it('keep the last values when a later read fails, and say so', async () => {
    const { extension, seen } = recordingExtension();
    vi.mocked(loadExtension).mockResolvedValue(extension);
    renderPage('/x/kanban');
    expect(await screen.findByText('mounted kanban')).toBeTruthy();
    const socket = await openSocket();
    config = () => json({ error: 'boom' }, 500);
    act(() => socket.emit({ type: 'config:changed', provider: 'dashboard-plugins', section: 'kanban', keys: ['mode'], version: 'v2' }));
    expect(await screen.findByText('Could not load the settings of Kanban: it runs with its defaults.')).toBeTruthy();
    expect(seen.changes).toEqual([]);
    expect(seen.context?.config).toEqual({ refreshSeconds: 60, mode: 'full' });
  });

  it('mount it with {} when it is not among the installed plugins', async () => {
    extensions = [{ ...KANBAN, package: undefined }];
    const { extension, seen } = recordingExtension();
    vi.mocked(loadExtension).mockResolvedValue(extension);
    renderPage('/x/kanban');
    expect(await screen.findByText('mounted kanban')).toBeTruthy();
    expect(seen.mounted).toEqual([{}]);
    expect(configRequests()).toEqual([]);
  });
});

describe('a built-in extension', () => {
  it('gets config undefined, without a request, and ignores config:changed', async () => {
    const { extension, seen } = recordingExtension();
    vi.mocked(loadExtension).mockResolvedValue(extension);
    renderPage('/x/jobs');
    expect(await screen.findByText('mounted jobs')).toBeTruthy();
    expect(seen.mounted).toEqual([undefined]);
    expect('config' in (seen.context ?? {}) ? seen.context?.config : 'absent').toBeUndefined();
    const socket = await openSocket();
    act(() => socket.emit({ type: 'config:changed', provider: 'dashboard-plugins', section: 'jobs', keys: ['x'], version: 'v2' }));
    expect(configRequests()).toEqual([]);
    expect(seen.changes).toEqual([]);
  });
});
