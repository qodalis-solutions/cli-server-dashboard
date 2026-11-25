// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import PluginsPage from './PluginsPage';
import { readmeExcerpt } from './marketplaceText';
import { AuthProvider } from '../../context/AuthContext';
import { ExtensionsProvider } from '../../context/ExtensionsContext';
import { WebSocketProvider } from '../../context/WebSocketContext';
import { I18nProvider, LOCALES } from '../../i18n';
import { setToken } from '../../api/client';
import marketplaceMessages from '../../i18n/messages/marketplace';
import { FakeWebSocket } from '../../test/fakes';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const API = '/api/v1/qcli/dashboard/marketplace';

const JOBS = {
  name: '@qodalis/cli-dashboard-module-jobs', title: 'Jobs board', description: 'Background jobs at a glance', icon: '⏱',
  publisher: { id: 'qodalis', name: 'Qodalis', verified: true }, latest: '1.2.0', installed: null, updateAvailable: false,
  allowed: true, requires: { serverPackage: '@qodalis/cli-server-plugin-jobs', installed: true },
};
const KANBAN = {
  name: '@acme/dashboard-kanban', title: 'Kanban', description: 'Boards and cards', icon: '🗂️',
  publisher: { id: 'acme', name: 'Acme', verified: false }, latest: '0.3.0', installed: null, updateAvailable: false,
  allowed: false, blockedReason: 'unverified publisher', requires: { serverPackage: '@acme/cli-server-plugin-kanban', installed: false },
};
const REPORTS = {
  name: '@qodalis/cli-dashboard-module-reports', title: 'Reports', description: 'Charts', publisher: { name: 'Qodalis', verified: true },
  latest: '2.0.0', installed: { version: '1.0.0' }, updateAvailable: true, allowed: true, requires: null,
};

interface Server {
  info: Response | (() => Response);
  items: unknown[];
  total?: number;
  details: (name: string) => Response;
  installed: unknown[];
  extensions: unknown[];
  permissions: string[];
  /** Answer to POST/PUT/DELETE. */
  action: (method: string, url: string) => Response | Promise<Response>;
  requests: Array<{ method: string; url: string; body?: string }>;
}

let server: Server;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  setToken('tok');
  FakeWebSocket.install();
  server = {
    info: () => json({ marketplaceUrl: 'https://plugins.qodalis.com', install: 'verified', dashboardApi: 1 }),
    items: [JOBS, KANBAN, REPORTS],
    details: () => json({ error: 'not found' }, 404),
    installed: [],
    extensions: [],
    permissions: ['*'],
    action: () => json({ name: 'x', version: '1.0.0' }, 201),
    requests: [],
  };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    server.requests.push({ method, url, body: init?.body as string | undefined });
    const path = url.split('?')[0];
    if (path.endsWith('/auth/mode')) return json({ mode: 'password' });
    if (path.endsWith('/auth/me')) return json({ username: 'root', authenticatedAt: '' });
    if (path.endsWith('/sessions/ws-ticket')) return new Response('', { status: 404 });
    if (path.endsWith('/sessions/current')) return json({ user: { id: 'u1', name: 'root' }, permissions: server.permissions });
    if (path.endsWith('/dashboard/extensions')) return json({ extensions: server.extensions });
    if (method !== 'GET' && path.startsWith(`${API}/installed`)) return server.action(method, url);
    if (path === API) return typeof server.info === 'function' ? server.info() : server.info.clone();
    if (path === `${API}/plugins`) return json({ items: server.items, total: server.total ?? server.items.length, page: 1, pageSize: 20 });
    if (path.startsWith(`${API}/plugins/`)) return server.details(decodeURIComponent(path.slice(`${API}/plugins/`.length)));
    if (path === `${API}/installed`) return json(server.installed);
    if (path.endsWith('/plugins/installed')) return json([]);
    if (path.endsWith('/plugins')) return json([]);
    return json({ error: 'not found' }, 404);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Location() {
  const { pathname, search } = useLocation();
  return <div data-testid="location" hidden>{`${pathname}${search}`}</div>;
}

function renderPage(path = '/plugins?tab=marketplace', state?: unknown) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[{ pathname: path.split('?')[0], search: path.includes('?') ? `?${path.split('?')[1]}` : '', state }]}>
        <AuthProvider>
          <WebSocketProvider>
            <ExtensionsProvider>
              <PluginsPage />
              <Location />
            </ExtensionsProvider>
          </WebSocketProvider>
        </AuthProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

const location = () => screen.getByTestId('location').textContent;
const card = (title: string) => within(screen.getByRole('article', { name: title }));
const findCard = async (title: string) => within(await screen.findByRole('article', { name: title }));
const requests = (method: string, part: string) => server.requests.filter(r => r.method === method && r.url.includes(part));
/** Waits until the session (and so the permissions) has loaded. */
const sessionLoaded = () => waitFor(() => expect(requests('GET', '/sessions/current').length).toBeGreaterThan(0));

describe('Plugins page tabs in the URL', () => {
  it('opens Installed by default and Marketplace from ?tab=marketplace', async () => {
    renderPage('/plugins');
    expect(screen.getByRole('tab', { name: 'Installed' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Marketplace' }).getAttribute('aria-selected')).toBe('false');
    cleanup();

    renderPage('/plugins?tab=marketplace');
    expect(screen.getByRole('tab', { name: 'Marketplace' }).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('article', { name: 'Jobs board' })).toBeTruthy();
  });

  it('keeps the chosen tab in the URL and drops it for Installed', async () => {
    renderPage('/plugins?q=x');
    fireEvent.click(screen.getByRole('tab', { name: 'Marketplace' }));
    expect(location()).toBe('/plugins?q=x&tab=marketplace');
    expect(await screen.findByRole('article', { name: 'Jobs board' })).toBeTruthy();
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('plugins-tab-marketplace');

    fireEvent.click(screen.getByRole('tab', { name: 'Installed' }));
    expect(location()).toBe('/plugins?q=x');
    expect(screen.queryByRole('article', { name: 'Jobs board' })).toBeNull();
  });

  it('reads an unknown tab as Installed', () => {
    renderPage('/plugins?tab=nope');
    expect(screen.getByRole('tab', { name: 'Installed' }).getAttribute('aria-selected')).toBe('true');
  });

  it('moves between the tabs with the arrow keys', () => {
    renderPage('/plugins');
    const installed = screen.getByRole('tab', { name: 'Installed' });
    expect(installed.tabIndex).toBe(0);
    expect(screen.getByRole('tab', { name: 'Marketplace' }).tabIndex).toBe(-1);
    fireEvent.keyDown(installed, { key: 'ArrowRight' });
    expect(location()).toBe('/plugins?tab=marketplace');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Marketplace' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(location()).toBe('/plugins');
  });
});

describe('Marketplace tab: loading, empty and unavailable', () => {
  it('shows card skeletons while the marketplace loads', async () => {
    let answer: () => void = () => {};
    server.info = () => json({ marketplaceUrl: 'x', install: 'verified', dashboardApi: 1 });
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((input, init) =>
      String(input).includes(`${API}/plugins?`)
        ? new Promise(resolve => { answer = () => resolve(json({ items: [JOBS], total: 1, page: 1, pageSize: 20 })); })
        : original(input, init));
    renderPage();

    const status = await waitFor(() => {
      const found = screen.getAllByRole('status').find(s => s.textContent === 'Loading the marketplace…');
      expect(found).toBeTruthy();
      return found!;
    });
    expect(status.querySelectorAll('.rounded-xl')).toHaveLength(6);
    act(() => answer());
    expect(await screen.findByRole('article', { name: 'Jobs board' })).toBeTruthy();
    expect(screen.queryAllByRole('status').filter(s => s.textContent === 'Loading the marketplace…')).toHaveLength(0);
  });

  it('says so when the marketplace has no dashboard plugins', async () => {
    server.items = [];
    renderPage();
    expect(await screen.findByText('The marketplace has no dashboard plugins yet.')).toBeTruthy();
  });

  it('says so on a server without the marketplace, without asking for plugins', async () => {
    server.info = () => json({ error: 'Not found' }, 404);
    renderPage();
    expect(await screen.findByText('This server does not offer the marketplace.')).toBeTruthy();
    expect(screen.getByText('Dashboard plugins are installed through the admin plugin of a newer server.')).toBeTruthy();
    expect(requests('GET', `${API}/plugins`)).toHaveLength(0);
  });

  it('notes that installing is turned off, and the cards say why the buttons do nothing', async () => {
    server.info = () => json({ marketplaceUrl: 'x', install: 'off', dashboardApi: 1 });
    server.items = [{ ...JOBS, allowed: false, blockedReason: 'install disabled' }];
    renderPage();
    expect((await screen.findByRole('note')).textContent).toBe('Installing is turned off on this server: you can browse the marketplace only.');
    const install = await (await findCard('Jobs board')).findByRole('button', { name: 'Install' });
    expect(install.getAttribute('aria-disabled')).toBe('true');
    fireEvent.focus(install);
    expect((await screen.findByRole('tooltip')).textContent).toBe('Installing is turned off on this server');
  });

  it('shows a failing marketplace (502) with Retry', async () => {
    let fail = true;
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((input, init) =>
      fail && String(input).includes(`${API}/plugins?`)
        ? Promise.resolve(json({ error: 'marketplace unreachable' }, 502))
        : original(input, init));
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not load the marketplace');
    expect(alert.textContent).toContain('The marketplace cannot be reached: try again later.');
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('article', { name: 'Jobs board' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("shows a failure to read the server's marketplace settings", async () => {
    server.info = () => json({ error: 'boom' }, 500);
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not load the marketplace');
    expect(alert.textContent).toContain('boom');
  });
});

describe('Marketplace tab: cards', () => {
  it('shows icon, title, publisher with the verified badge, description and latest version', async () => {
    renderPage();
    const jobs = await findCard('Jobs board');
    expect(jobs.getByTestId('module-icon').textContent).toBe('⏱');
    expect(jobs.getByText('by Qodalis')).toBeTruthy();
    expect(jobs.getByText(/Verified publisher/)).toBeTruthy();
    expect(jobs.getByText('Background jobs at a glance')).toBeTruthy();
    expect(jobs.getByText('v1.2.0')).toBeTruthy();
    // Its server plugin is installed: no warning
    expect(jobs.queryByText(/Needs the server plugin/)).toBeNull();
  });

  it('marks an unverified publisher and warns about a missing server plugin', async () => {
    renderPage();
    const kanban = await findCard('Kanban');
    expect(kanban.getByText('by Acme')).toBeTruthy();
    expect(kanban.queryByText(/✓/)).toBeNull();
    expect(kanban.getByText('Unverified publisher').className).toContain('sr-only');
    expect(kanban.getByText('⚠ Needs the server plugin @acme/cli-server-plugin-kanban')).toBeTruthy();
  });

  it('shows the installed version and an available update', async () => {
    renderPage();
    const reports = await findCard('Reports');
    expect(reports.getByText('Installed: v1.0.0')).toBeTruthy();
    expect(reports.getByText('Update available')).toBeTruthy();
  });
});

describe('Marketplace tab: search and paging', () => {
  it('searches on the server once typing pauses, from the first page', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Jobs board' });
    server.items = [];
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search dashboard plugins' }), { target: { value: 'kan' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search dashboard plugins' }), { target: { value: 'kanban' } });

    expect(await screen.findByText('No dashboard plugins match “kanban”.')).toBeTruthy();
    const searches = requests('GET', `${API}/plugins?`).map(r => r.url);
    expect(searches).toEqual([`${API}/plugins?page=1&pageSize=20`, `${API}/plugins?page=1&pageSize=20&query=kanban`]);
  });

  it('pages through long lists', async () => {
    server.total = 45;
    renderPage();
    await screen.findByRole('article', { name: 'Jobs board' });
    const paging = screen.getByRole('navigation', { name: 'Pages' });
    expect(within(paging).getByText('Page 1 of 3')).toBeTruthy();
    fireEvent.click(within(paging).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(requests('GET', `${API}/plugins?page=2&pageSize=20`)).toHaveLength(1));
  });

  it('shows no paging for one page', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Jobs board' });
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
  });
});

describe('Marketplace tab: permission', () => {
  it('shows Install, Update and Remove with dashboard:install', async () => {
    server.permissions = ['admin:access', 'dashboard:install'];
    renderPage();
    await sessionLoaded();
    expect(await (await findCard('Jobs board')).findByRole('button', { name: 'Install' })).toBeTruthy();
    expect(card('Reports').getByRole('button', { name: 'Update' })).toBeTruthy();
    expect(card('Reports').getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('shows them through a wildcard permission', async () => {
    server.permissions = ['dashboard:*'];
    renderPage();
    expect(await (await findCard('Jobs board')).findByRole('button', { name: 'Install' })).toBeTruthy();
  });

  it('shows only Details without it', async () => {
    server.permissions = ['admin:access'];
    renderPage();
    await sessionLoaded();
    await screen.findByRole('article', { name: 'Jobs board' });
    for (const title of ['Jobs board', 'Kanban', 'Reports']) {
      expect(card(title).getAllByRole('button').map(b => b.textContent)).toEqual(['Details']);
    }
  });

  it('keeps a blocked install focusable with the reason as its tooltip, and does nothing on click', async () => {
    renderPage();
    const install = await (await findCard('Kanban')).findByRole('button', { name: 'Install' });
    expect(install.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(install);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.focus(install);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe('The publisher is not verified');
    expect(install.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect(requests('POST', `${API}/installed`)).toHaveLength(0);
  });

  it('translates a blocked dashboard API and keeps unknown reasons as written', async () => {
    server.items = [
      { ...JOBS, allowed: false, blockedReason: 'needs dashboard API 2' },
      { ...KANBAN, allowed: false, blockedReason: 'maintenance window' },
    ];
    renderPage();
    fireEvent.focus(await (await findCard('Jobs board')).findByRole('button', { name: 'Install' }));
    expect((await screen.findByRole('tooltip')).textContent).toBe('Needs dashboard API 2');
    fireEvent.blur(card('Jobs board').getByRole('button', { name: 'Install' }));
    fireEvent.focus(card('Kanban').getByRole('button', { name: 'Install' }));
    await waitFor(() => expect(screen.getByRole('tooltip').textContent).toBe('maintenance window'));
  });
});

describe('Marketplace tab: install, update, remove', () => {
  async function clickInstall() {
    renderPage();
    fireEvent.click(await (await findCard('Jobs board')).findByRole('button', { name: 'Install' }));
    return screen.findByRole('dialog');
  }

  it('asks first, naming the publisher and that the plugin runs with your permissions', async () => {
    const dialog = await clickInstall();
    expect(within(dialog).getByText('Install Jobs board?')).toBeTruthy();
    expect(dialog.textContent).toContain('Jobs board runs inside your dashboard with your permissions');
    expect(dialog.textContent).toContain('Its publisher is Qodalis.');
  });

  it('installs nothing when cancelled', async () => {
    const dialog = await clickInstall();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(requests('POST', `${API}/installed`)).toHaveLength(0);
  });

  it('installs on confirm with a spinner, then says so and reloads the pages and the list', async () => {
    let finish: () => void = () => {};
    server.action = () => new Promise(resolve => { finish = () => resolve(json({ name: JOBS.name, version: '1.2.0' }, 201)); });
    const dialog = await clickInstall();
    const loadsBefore = requests('GET', '/dashboard/extensions').length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Install' }));

    const busy = await screen.findByText('Installing Jobs board…');
    expect(busy.closest('[role="status"]')).toBeTruthy();
    expect(card('Jobs board').getByRole('button', { name: 'Install' })).toHaveProperty('disabled', true);
    expect(card('Reports').getByRole('button', { name: 'Remove' })).toHaveProperty('disabled', true);
    expect(requests('POST', `${API}/installed`).map(r => r.body)).toEqual([JSON.stringify({ name: JOBS.name })]);

    server.items = [{ ...JOBS, installed: { version: '1.2.0' } }, KANBAN, REPORTS];
    server.extensions = [{ id: 'jobs', title: 'Jobs', entry: '/qcli/modules/jobs/extension.js', source: 'marketplace' }];
    act(() => finish());
    expect(await screen.findByText('Jobs board installed: its page is in the navigation.')).toBeTruthy();
    expect(screen.queryByText('Installing Jobs board…')).toBeNull();
    await waitFor(() => expect(requests('GET', '/dashboard/extensions').length).toBe(loadsBefore + 1));
    expect(await (await findCard('Jobs board')).findByText('Installed: v1.2.0')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Jobs board installed: its page is in the navigation.')).toBeNull();
  });

  it.each([
    ['unreachable (502)', () => json({ error: 'marketplace unreachable' }, 502), 'The marketplace cannot be reached: try again later.'],
    ['an unverified publisher (403)', () => json({ error: 'publisher not verified' }, 403),
      'The publisher is not verified, and this server installs plugins of verified publishers only.'],
    ['an integrity mismatch (502)', () => json({ error: 'integrity mismatch: dist/extension.js' }, 502),
      'A downloaded file does not match its checksum in the marketplace: nothing was installed.'],
    ['an id clash (409)', () => json({ error: 'extension id jobs already registered' }, 409),
      'Another dashboard page already uses this plugin’s id.'],
    ['a missing permission (403)', () => json({ error: 'Forbidden' }, 403), 'You are not allowed to install dashboard plugins.'],
    ['another failure', () => json({ error: 'disk full' }, 500), 'disk full'],
  ])('reports %s', async (_, answer, message) => {
    server.action = answer;
    const dialog = await clickInstall();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Install' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not install Jobs board');
    expect(alert.textContent).toContain(message);
    expect(screen.queryByRole('dialog')).toBeNull();
    // The card stays usable
    expect(card('Jobs board').getByRole('button', { name: 'Install' })).toHaveProperty('disabled', false);
  });

  it('clears an earlier failure when the next action succeeds', async () => {
    server.action = () => json({ error: 'marketplace unreachable' }, 502);
    let dialog = await clickInstall();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Install' }));
    await screen.findByRole('alert');

    server.action = () => json({ name: JOBS.name, version: '1.2.0' }, 201);
    fireEvent.click(card('Jobs board').getByRole('button', { name: 'Install' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Install' }));
    expect(await screen.findByText('Jobs board installed: its page is in the navigation.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('updates after asking, with PUT', async () => {
    renderPage();
    fireEvent.click(await (await findCard('Reports')).findByRole('button', { name: 'Update' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Update Reports?')).toBeTruthy();
    expect(dialog.textContent).toContain('The new version runs inside your dashboard with your permissions. Its publisher is Qodalis.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }));
    expect(await screen.findByText('Reports updated.')).toBeTruthy();
    expect(requests('PUT', `${API}/installed/`).map(r => r.url)).toEqual([`${API}/installed/%40qodalis%2Fcli-dashboard-module-reports`]);
  });

  it('removes after a danger confirmation, with DELETE', async () => {
    server.action = () => new Response(null, { status: 204 });
    renderPage();
    fireEvent.click(await (await findCard('Reports')).findByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Remove Reports?')).toBeTruthy();
    expect(dialog.textContent).toContain('Its page leaves the dashboard for every user.');
    expect(within(dialog).getByRole('button', { name: 'Remove' }).className).toContain('error');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Reports removed.')).toBeTruthy();
    expect(requests('DELETE', `${API}/installed/`)).toHaveLength(1);
  });

  it('reports a failed remove', async () => {
    server.action = () => json({ error: 'marketplace unreachable' }, 502);
    renderPage();
    fireEvent.click(await (await findCard('Reports')).findByRole('button', { name: 'Remove' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not remove Reports');
  });

  it('reloads the list on dashboard:extensions-changed from another dashboard', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Jobs board' });
    await waitFor(() => expect(FakeWebSocket.live).toHaveLength(1));
    const socket = FakeWebSocket.live[0];
    act(() => socket.open());
    const before = requests('GET', `${API}/plugins?`).length;
    server.items = [{ ...JOBS, installed: { version: '1.2.0' } }];
    act(() => socket.emit({ type: 'dashboard:extensions-changed' }));
    expect(await (await findCard('Jobs board')).findByText('Installed: v1.2.0')).toBeTruthy();
    expect(requests('GET', `${API}/plugins?`).length).toBe(before + 1);
  });
});

describe('Marketplace tab: details', () => {
  const versions = Array.from({ length: 9 }, (_, i) => ({ version: `1.${8 - i}.0`, files: [] }));
  const DETAILS = {
    ...KANBAN,
    readme: `# Kanban\n\nBoards for your server.\n${'More text. '.repeat(200)}`,
    versions: [
      { version: '0.3.0', dashboardApi: 1, files: [
        { path: 'dist/extension.js', integrity: 'sha384-abc', size: 2048 },
        { path: 'dist/extension.css', integrity: 'sha384-def', size: 512 },
      ] },
      ...versions,
    ],
    serverPackages: { node: '@acme/cli-server-plugin-kanban', dotnet: 'Acme.Cli.Plugin.Kanban' },
  };

  it('opens a dialog with readme excerpt, versions, files with sizes and server packages', async () => {
    server.details = name => (name === KANBAN.name ? json(DETAILS) : json({ error: 'not found' }, 404));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Details of Kanban' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Kanban' }));

    const readme = await dialog.findByTestId('readme');
    expect(readme.textContent!.startsWith('# Kanban\n\nBoards for your server.')).toBe(true);
    expect(readme.textContent!.endsWith('…')).toBe(true);
    expect(readme.textContent!.length).toBeLessThan(DETAILS.readme.length);

    expect(dialog.getByText('v0.3.0')).toBeTruthy();
    // Ten versions: six shown, then +4 more opening the full list
    expect(dialog.getByRole('button', { name: /\+4/ })).toBeTruthy();
    expect(dialog.getByText('Files of v0.3.0')).toBeTruthy();
    expect(dialog.getByText('dist/extension.js · 2 KB')).toBeTruthy();
    expect(dialog.getByText('dist/extension.css · 512 B')).toBeTruthy();
    expect(dialog.getByText('node: @acme/cli-server-plugin-kanban')).toBeTruthy();
    expect(dialog.getByText('dotnet: Acme.Cli.Plugin.Kanban')).toBeTruthy();
    expect(server.requests.some(r => r.url === `${API}/plugins/%40acme%2Fdashboard-kanban`)).toBe(true);
  });

  it('opens every version from +N more', async () => {
    server.details = () => json(DETAILS);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Details of Kanban' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Kanban' }));
    fireEvent.click(await dialog.findByRole('button', { name: /\+4/ }));
    const all = within(await screen.findByRole('dialog', { name: /Versions of Kanban/ }));
    expect(all.getByText('v1.0.0')).toBeTruthy();
  });

  it('says when there is no readme and no server package', async () => {
    server.details = () => json({ ...JOBS, readme: '', versions: [{ version: '1.2.0', files: [] }] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Details of Jobs board' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Jobs board' }));
    expect(await dialog.findByText('No readme.')).toBeTruthy();
    expect(dialog.getAllByText('None')).toHaveLength(2);
  });

  it('shows a failure to load the details with Retry', async () => {
    let fail = true;
    server.details = () => (fail ? json({ error: 'marketplace unreachable' }, 502) : json(DETAILS));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Details of Kanban' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Kanban' }));
    const alert = await dialog.findByRole('alert');
    expect(alert.textContent).toContain('Could not load the details');
    expect(alert.textContent).toContain('The marketplace cannot be reached');
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await dialog.findByTestId('readme')).toBeTruthy();
  });

  it('closes', async () => {
    server.details = () => json(DETAILS);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Details of Kanban' }));
    const dialog = await screen.findByRole('dialog', { name: 'Kanban' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('cuts a readme at a line end near the limit', () => {
    expect(readmeExcerpt('short')).toBe('short');
    expect(readmeExcerpt(`${'a'.repeat(80)}\n${'b'.repeat(40)}`, 100)).toBe(`${'a'.repeat(80)}\n…`);
    expect(readmeExcerpt('x'.repeat(300), 100)).toBe(`${'x'.repeat(100)}\n…`);
  });
});

describe('Installed tab: marketplace plugins', () => {
  const INSTALLED = [
    { name: '@acme/dashboard-kanban', version: '0.3.0', title: 'Kanban', icon: '🗂️', id: 'kanban', installedBy: 'root', updateAvailable: true },
    { name: '@qodalis/cli-dashboard-module-reports', version: '2.0.0', title: 'Reports', id: 'reports' },
  ];

  it('lists them with a Marketplace badge, a link to their page, Update and Remove', async () => {
    server.installed = INSTALLED;
    renderPage('/plugins');
    expect(await screen.findByText('Dashboard plugins')).toBeTruthy();
    const kanban = card('Kanban');
    expect(kanban.getByText('Marketplace')).toBeTruthy();
    expect(kanban.getByText('Update available')).toBeTruthy();
    expect(kanban.getByText('Installed by root')).toBeTruthy();
    expect(kanban.getByRole('link', { name: 'Kanban' }).getAttribute('href')).toBe('/x/kanban');
    await sessionLoaded();
    expect(await kanban.findByRole('button', { name: 'Update' })).toBeTruthy();
    expect(kanban.getByRole('button', { name: 'Remove' })).toBeTruthy();
    // Up to date: no Update
    expect(card('Reports').queryByRole('button', { name: 'Update' })).toBeNull();
    expect(card('Reports').getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('hides Update and Remove without dashboard:install', async () => {
    server.installed = INSTALLED;
    server.permissions = ['admin:access'];
    renderPage('/plugins');
    await screen.findByText('Dashboard plugins');
    await sessionLoaded();
    expect(card('Kanban').queryByRole('button')).toBeNull();
    expect(card('Reports').queryByRole('button')).toBeNull();
  });

  it('shows no section when nothing came from the marketplace', async () => {
    renderPage('/plugins');
    await waitFor(() => expect(requests('GET', `${API}/installed`)).toHaveLength(1));
    expect(screen.queryByText('Dashboard plugins')).toBeNull();
  });

  it('updates with a confirmation that does not need the publisher', async () => {
    server.installed = INSTALLED;
    renderPage('/plugins');
    fireEvent.click(await (await findCard('Kanban')).findByRole('button', { name: 'Update' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('The new version runs inside your dashboard with your permissions.');
    expect(dialog.textContent).not.toContain('publisher');
    server.installed = [{ ...INSTALLED[0], updateAvailable: false, version: '0.4.0' }, INSTALLED[1]];
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }));
    expect(await screen.findByText('Kanban updated.')).toBeTruthy();
    expect(await screen.findByText('v0.4.0')).toBeTruthy();
    expect(requests('PUT', `${API}/installed/%40acme%2Fdashboard-kanban`)).toHaveLength(1);
  });

  it('removes, and the card leaves', async () => {
    server.installed = INSTALLED;
    server.action = () => new Response(null, { status: 204 });
    renderPage('/plugins');
    fireEvent.click(await (await findCard('Reports')).findByRole('button', { name: 'Remove' }));
    server.installed = [INSTALLED[0]];
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Reports removed.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Reports' })).toBeNull());
  });

  it('reports a failed update (integrity mismatch)', async () => {
    server.installed = INSTALLED;
    server.action = () => json({ error: 'integrity mismatch' }, 502);
    renderPage('/plugins');
    fireEvent.click(await (await findCard('Kanban')).findByRole('button', { name: 'Update' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Update' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not update Kanban');
    expect(alert.textContent).toContain('nothing was installed');
  });
});

describe('Plugins page: a removed page', () => {
  it('says which page was removed, until dismissed', async () => {
    renderPage('/plugins', { removedPage: 'Kanban' });
    const notice = await screen.findByText('The page Kanban was removed from the dashboard.');
    fireEvent.click(within(notice.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('The page Kanban was removed from the dashboard.')).toBeNull();
  });
});

describe('Marketplace translations', () => {
  it('has every text in every language', () => {
    const keys = Object.keys(marketplaceMessages.en).sort();
    for (const { code } of LOCALES) {
      const messages = (marketplaceMessages as Record<string, Record<string, string> | undefined>)[code];
      expect(Object.keys(messages ?? {}).sort(), code).toEqual(keys);
      // Every placeholder of English is kept
      for (const key of keys) {
        const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
        expect(placeholders(messages![key]), `${code}.${key}`).toEqual(placeholders(marketplaceMessages.en[key as keyof typeof marketplaceMessages.en]));
      }
    }
  });

  it('shows the tab in German', async () => {
    localStorage.setItem('qcli_admin_locale', 'de');
    renderPage();
    expect(screen.getByRole('tab', { name: 'Marktplatz' })).toBeTruthy();
    expect(await (await findCard('Jobs board')).findByText('von Qodalis')).toBeTruthy();
    expect(card('Jobs board').getByRole('button', { name: 'Installieren' })).toBeTruthy();
  });
});
