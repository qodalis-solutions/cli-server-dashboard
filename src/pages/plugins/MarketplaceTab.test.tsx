// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import PluginsPage from './PluginsPage';
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
  /** GET /installed/{name}/config. */
  pluginConfig: (name: string) => Response;
  /** GET /api/v1/qcli/config. */
  configOverview: () => Response;
  /** Answer to POST/PUT/DELETE. */
  action: (method: string, url: string) => Response | Promise<Response>;
  requests: Array<{ method: string; url: string; body?: string }>;
  /** GET /api/v1/qcli/plugins/installed (the server's packages). */
  packages?: unknown[];
  /** Answers the server marketplace (`/api/v1/qcli/server/marketplace...`); none: 404. */
  serverMarket?: (method: string, path: string) => Response;
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
    pluginConfig: () => json({ error: 'not found' }, 404),
    configOverview: () => json({ error: 'not found' }, 404),
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
    if (path.startsWith('/api/v1/qcli/server/marketplace')) return server.serverMarket ? server.serverMarket(method, path) : json({ error: 'not found' }, 404);
    if (method !== 'GET' && path.startsWith(`${API}/installed`)) return server.action(method, url);
    if (path.startsWith(`${API}/installed/`) && path.endsWith('/config')) {
      return server.pluginConfig(decodeURIComponent(path.slice(`${API}/installed/`.length, -'/config'.length)));
    }
    if (path === '/api/v1/qcli/config') return server.configOverview();
    if (path === API) return typeof server.info === 'function' ? server.info() : server.info.clone();
    if (path === `${API}/plugins`) return json({ items: server.items, total: server.total ?? server.items.length, page: 1, pageSize: 20 });
    if (path.startsWith(`${API}/plugins/`)) return server.details(decodeURIComponent(path.slice(`${API}/plugins/`.length)));
    if (path === `${API}/installed`) return json(server.installed);
    if (path.endsWith('/plugins/installed')) return json(server.packages ?? []);
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
/** The open dialog, once an install or update dialog has loaded the plugin's settings (its button is enabled then). */
async function findDialog() {
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).queryByText('Loading the settings…')).toBeNull());
  return dialog;
}
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

describe('Marketplace tab: added in code', () => {
  const AUDIT = {
    name: '@qodalis/cli-dashboard-module-audit', title: 'Audit log', description: 'Audit page', publisher: { name: 'qodalis', verified: true },
    latest: '1.0.0-beta.29', installed: { version: '1.0.0-beta.28', source: 'code' }, updateAvailable: true, allowed: true, requires: null,
  };
  const USERS = {
    name: '@qodalis/cli-dashboard-module-users', title: 'Users', description: 'Users page', publisher: { name: 'qodalis', verified: true },
    latest: '1.0.0', installed: { version: null, source: 'code' }, updateAvailable: false, allowed: true, requires: null,
  };
  const INSTALLED = { ...REPORTS, installed: { version: '1.0.0', source: 'marketplace' } };

  it('shows a page the host adds in code as added in code with its version, no Install, Update or Remove', async () => {
    server.items = [AUDIT, USERS, INSTALLED];
    server.permissions = ['admin:access', 'dashboard:install'];
    renderPage();
    await sessionLoaded();
    const audit = await findCard('Audit log');
    expect(audit.getByText('Added in code · v1.0.0-beta.28')).toBeTruthy();
    expect(audit.getByText('Newer version v1.0.0-beta.29 in the marketplace; update it in code')).toBeTruthy();
    expect(audit.queryByText('Update available')).toBeNull();
    expect(audit.getAllByRole('button').map(b => b.textContent)).toEqual(['Details']);
    // without a version: the badge alone
    expect(card('Users').getByText('Added in code')).toBeTruthy();
    expect(card('Users').queryByTestId('newer-in-code')).toBeNull();
    expect(card('Users').getAllByRole('button').map(b => b.textContent)).toEqual(['Details']);
    // installed from the marketplace: still updated and removed here
    expect(card('Reports').getByText('Installed: v1.0.0')).toBeTruthy();
    expect(card('Reports').getByRole('button', { name: 'Update' })).toBeTruthy();
    expect(card('Reports').getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('says so in the details dialog', async () => {
    server.items = [AUDIT];
    server.details = () => json({ ...AUDIT, readme: '', versions: [{ version: '1.0.0-beta.29', files: [] }], serverPackages: [] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Details of Audit log' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Audit log' }));
    const state = within(await dialog.findByTestId('install-state'));
    expect(state.getByText('Added in code · v1.0.0-beta.28')).toBeTruthy();
    expect(state.getByText('Newer version v1.0.0-beta.29 in the marketplace; update it in code')).toBeTruthy();
    expect(dialog.queryByRole('button', { name: 'Install' })).toBeNull();
  });
});

describe('Marketplace tab: installed filter', () => {
  it('shows all by default and filters installed or not, kept in the URL', async () => {
    renderPage();
    await findCard('Jobs board');
    const group = within(screen.getByRole('group', { name: 'Installed or not' }));
    expect(group.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(group.getByRole('button', { name: 'Installed' }));
    expect(location()).toContain('installed=yes');
    await waitFor(() => expect(screen.getAllByRole('article').map(a => a.getAttribute('aria-label'))).toEqual(['Reports']));
    fireEvent.click(group.getByRole('button', { name: 'Not installed' }));
    expect(location()).toContain('installed=no');
    await waitFor(() => expect(screen.getAllByRole('article').map(a => a.getAttribute('aria-label'))).toEqual(['Jobs board', 'Kanban']));
    fireEvent.click(group.getByRole('button', { name: 'All' }));
    expect(location()).not.toContain('installed=');
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
    return findDialog();
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

    // In the dialog, which stays open: closing it hid the failure above the list, out of view
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain('Could not install Jobs board');
    expect(alert.textContent).toContain(message);
    expect(screen.getByRole('dialog')).toBe(dialog);
    // Cancel closes it; the card stays usable
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(card('Jobs board').getByRole('button', { name: 'Install' })).toHaveProperty('disabled', false);
  });

  it('clears an earlier failure when the next attempt succeeds', async () => {
    server.action = () => json({ error: 'marketplace unreachable' }, 502);
    const dialog = await clickInstall();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Install' }));
    await within(dialog).findByRole('alert');

    // Install again from the same dialog
    server.action = () => json({ name: JOBS.name, version: '1.2.0' }, 201);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Install' }));
    expect(await screen.findByText('Jobs board installed: its page is in the navigation.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('updates after asking, with PUT', async () => {
    renderPage();
    fireEvent.click(await (await findCard('Reports')).findByRole('button', { name: 'Update' }));
    const dialog = await findDialog();
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
    const dialog = await findDialog();
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
    fireEvent.click(within(await findDialog()).getByRole('button', { name: 'Remove' }));
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

  it('opens a dialog with the rendered readme, versions, files with sizes and server packages', async () => {
    server.details = name => (name === KANBAN.name ? json(DETAILS) : json({ error: 'not found' }, 404));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Details of Kanban' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Kanban' }));

    const readme = await dialog.findByTestId('readme');
    expect(within(readme).getByRole('heading', { name: 'Kanban' })).toBeTruthy();
    expect(readme.textContent).toContain('Boards for your server.');

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
    const dialog = await findDialog();
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
    fireEvent.click(within(await findDialog()).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Reports removed.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Reports' })).toBeNull());
  });

  it('reports a failed update (integrity mismatch)', async () => {
    server.installed = INSTALLED;
    server.action = () => json({ error: 'integrity mismatch' }, 502);
    renderPage('/plugins');
    fireEvent.click(await (await findCard('Kanban')).findByRole('button', { name: 'Update' }));
    fireEvent.click(within(await findDialog()).getByRole('button', { name: 'Update' }));
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

describe('Marketplace plugin settings', () => {
  const ENTRIES = [
    { key: 'refreshSeconds', label: 'Refresh every', description: 'Seconds between reloads', type: 'number', default: 30, validation: { min: 5, max: 3600 } },
    { key: 'columns', label: 'Columns', type: 'string[]', default: ['name', 'status'], validation: { min: 1, max: 5 } },
    { key: 'mode', label: 'Mode', type: 'enum', default: 'compact', validation: { options: ['compact', 'full'] } },
    { key: 'heading', label: 'Heading', type: 'string', default: 'Jobs', validation: { required: true, max: 10 } },
    { key: 'homepage', label: 'Homepage', type: 'url', default: 'https://jobs.example' },
    { key: 'window', label: 'Window', type: 'duration', default: '15m', validation: { min: 60000 } },
    { key: 'filters', label: 'Filters', type: 'json', default: { failed: true } },
    { key: 'compact', label: 'Compact cards', type: 'boolean', default: false },
  ];
  const withSettings = (latest: string, entries: unknown[] = ENTRIES) => (name: string) => json({
    name, title: name, latest, publisher: { name: 'Qodalis', verified: true }, allowed: true,
    versions: [{ version: latest, files: [{ path: 'dist/extension.js', size: 100 }], config: { entries } }, { version: '0.1.0', files: [] }],
  });
  const installBodies = () => requests('POST', `${API}/installed`).map(r => JSON.parse(r.body ?? '{}'));
  /** The dialog's Install (or Update) once the settings have loaded. */
  const confirmButton = async (dialog: HTMLElement, name: string) => {
    await waitFor(() => expect(within(dialog).queryByText('Loading the settings…')).toBeNull());
    return within(dialog).getByRole('button', { name });
  };
  const field = (dialog: HTMLElement, key: string) => dialog.querySelector(`[data-setting="${key}"]`) as HTMLElement;

  async function openInstall() {
    server.details = withSettings('1.2.0');
    renderPage();
    fireEvent.click(await (await findCard('Jobs board')).findByRole('button', { name: 'Install' }));
    const dialog = await findDialog();
    await within(dialog).findByText('Settings');
    return dialog;
  }

  it('shows every setting with its default, editable, with the confirmation', async () => {
    const dialog = await openInstall();
    expect(within(dialog).getByText('Install Jobs board?')).toBeTruthy();
    expect(dialog.textContent).toContain('runs inside your dashboard with your permissions');
    expect(within(dialog).getByText('Defaults of the plugin: change them now or later on the Config page.')).toBeTruthy();
    const d = within(dialog);
    expect((d.getByLabelText('Refresh every') as HTMLInputElement).value).toBe('30');
    expect(d.getByText('refreshSeconds')).toBeTruthy();
    expect(d.getByText('Seconds between reloads')).toBeTruthy();
    expect(within(field(dialog, 'columns')).getByText('name')).toBeTruthy();
    expect(within(field(dialog, 'columns')).getByText('status')).toBeTruthy();
    expect(d.getByRole('combobox', { name: 'Mode' }).textContent).toContain('compact');
    expect((d.getByLabelText('Heading') as HTMLInputElement).value).toBe('Jobs');
    expect((d.getByLabelText('Homepage') as HTMLInputElement).value).toBe('https://jobs.example');
    expect((d.getByLabelText('Window') as HTMLInputElement).value).toBe('15m');
    expect((d.getByLabelText('Filters') as HTMLTextAreaElement).value).toBe('{\n  "failed": true\n}');
    expect(d.getByRole('switch', { name: 'Compact cards' }).getAttribute('aria-checked')).toBe('false');
    expect(requests('GET', `${API}/plugins/%40qodalis%2Fcli-dashboard-module-jobs`)).toHaveLength(1);
  });

  it('sends no config when nothing changed: the plugin keeps following its defaults', async () => {
    const dialog = await openInstall();
    fireEvent.click(await confirmButton(dialog, 'Install'));
    expect(await screen.findByText('Jobs board installed: its page is in the navigation.')).toBeTruthy();
    expect(installBodies()).toEqual([{ name: JOBS.name }]);
  });

  it('sends only the changed settings', async () => {
    const dialog = await openInstall();
    const d = within(dialog);
    fireEvent.change(d.getByLabelText('Refresh every'), { target: { value: '60' } });
    fireEvent.click(d.getByRole('switch', { name: 'Compact cards' }));
    fireEvent.click(d.getByRole('combobox', { name: 'Mode' }));
    fireEvent.click(screen.getByRole('option', { name: 'full' }));
    // Typed back to its default: no change
    fireEvent.change(d.getByLabelText('Window'), { target: { value: '15m' } });
    fireEvent.click(await confirmButton(dialog, 'Install'));
    await screen.findByText('Jobs board installed: its page is in the navigation.');
    expect(installBodies()).toEqual([{ name: JOBS.name, config: { refreshSeconds: 60, compact: true, mode: 'full' } }]);
  });

  it.each([
    ['number below its minimum', 'Refresh every', '2', 'At least 5'],
    ['number that is not one', 'Refresh every', 'abc', 'Must be a number'],
    ['required string left empty', 'Heading', '', 'Required'],
    ['string over its length', 'Heading', 'A heading far too long', 'At most 10 characters'],
    ['url that is not absolute', 'Homepage', 'jobs.example', 'Must be an absolute URL (https://…)'],
    ['duration that is not one', 'Window', 'soon', 'Must be a duration such as 500ms, 30s, 15m, 12h or 7d'],
    ['duration below its minimum', 'Window', '30s', 'At least 1m'],
    ['json that does not parse', 'Filters', '{ failed', 'Must be valid JSON'],
  ])('blocks Install for a %s until it is corrected', async (_, label, value, message) => {
    const dialog = await openInstall();
    const d = within(dialog);
    const original = (d.getByLabelText(label) as HTMLInputElement).value;
    fireEvent.change(d.getByLabelText(label), { target: { value } });
    expect(d.getByRole('alert').textContent).toBe(message);
    expect(d.getByText('Correct the settings marked in red first.')).toBeTruthy();
    const install = await confirmButton(dialog, 'Install');
    expect(install).toHaveProperty('disabled', true);
    expect(install.getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.click(install);
    expect(requests('POST', `${API}/installed`)).toHaveLength(0);

    fireEvent.change(d.getByLabelText(label), { target: { value: original } });
    expect(d.queryByRole('alert')).toBeNull();
    expect(install).toHaveProperty('disabled', false);
  });

  it('blocks Install for a list with too few items', async () => {
    const dialog = await openInstall();
    const columns = within(field(dialog, 'columns'));
    fireEvent.click(columns.getByRole('button', { name: 'Remove name' }));
    fireEvent.click(columns.getByRole('button', { name: 'Remove status' }));
    expect(columns.getByRole('alert').textContent).toBe('At least 1 items');
    expect(await confirmButton(dialog, 'Install')).toHaveProperty('disabled', true);
    const input = columns.getByLabelText('Columns');
    fireEvent.change(input, { target: { value: 'owner' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(columns.queryByRole('alert')).toBeNull();
    fireEvent.click(await confirmButton(dialog, 'Install'));
    await screen.findByText('Jobs board installed: its page is in the navigation.');
    expect(installBodies()).toEqual([{ name: JOBS.name, config: { columns: ['owner'] } }]);
  });

  it("shows the server's per-key errors under their fields and keeps the dialog open", async () => {
    server.action = () => json({ error: 'validation failed', errors: { refreshSeconds: 'must be a multiple of 5', removed: 'unknown key' } }, 400);
    const dialog = await openInstall();
    const d = within(dialog);
    fireEvent.change(d.getByLabelText('Refresh every'), { target: { value: '61' } });
    fireEvent.click(await confirmButton(dialog, 'Install'));

    await waitFor(() => expect(within(field(dialog, 'refreshSeconds')).getByRole('alert').textContent).toBe('must be a multiple of 5'));
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(dialog.textContent).toContain('The server did not accept these settings: removed: unknown key');
    expect(screen.queryByText(/Could not install/)).toBeNull();
    expect((d.getByLabelText('Refresh every') as HTMLInputElement).value).toBe('61');
    expect(d.getByRole('button', { name: 'Install' })).toHaveProperty('disabled', false);

    // Edited: the server's message goes; the next answer installs
    fireEvent.change(d.getByLabelText('Refresh every'), { target: { value: '65' } });
    expect(within(field(dialog, 'refreshSeconds')).queryByRole('alert')).toBeNull();
    server.action = () => json({ name: JOBS.name, version: '1.2.0' }, 201);
    fireEvent.click(d.getByRole('button', { name: 'Install' }));
    expect(await screen.findByText('Jobs board installed: its page is in the navigation.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(installBodies().map(b => b.config)).toEqual([{ refreshSeconds: 61 }, { refreshSeconds: 65 }]);
  });

  it('installs with the defaults when the settings cannot be loaded, and says so', async () => {
    renderPage();
    fireEvent.click(await (await findCard('Jobs board')).findByRole('button', { name: 'Install' }));
    const dialog = await findDialog();
    expect(await within(dialog).findByText('Could not load the settings: the plugin gets its defaults, change them later on the Config page.')).toBeTruthy();
    fireEvent.click(await confirmButton(dialog, 'Install'));
    expect(await screen.findByText('Jobs board installed: its page is in the navigation.')).toBeTruthy();
    expect(installBodies()).toEqual([{ name: JOBS.name }]);
  });

  it('shows no settings section for a version without any', async () => {
    server.details = withSettings('1.2.0', []);
    renderPage();
    fireEvent.click(await (await findCard('Jobs board')).findByRole('button', { name: 'Install' }));
    const dialog = await findDialog();
    await confirmButton(dialog, 'Install');
    expect(within(dialog).queryByText('Settings')).toBeNull();
    expect(within(dialog).queryByRole('note')).toBeNull();
  });

  describe('update', () => {
    async function openUpdate() {
      server.details = withSettings('2.0.0');
      server.pluginConfig = () => json({ values: { refreshSeconds: 120, mode: 'legacy', heading: 'Ops', gone: 1 }, version: 'v4' });
      renderPage();
      fireEvent.click(await (await findCard('Reports')).findByRole('button', { name: 'Update' }));
      const dialog = await findDialog();
      await within(dialog).findByText('Settings');
      return dialog;
    }

    it('shows the current values; one the new version no longer accepts from its new default', async () => {
      const dialog = await openUpdate();
      const d = within(dialog);
      expect(within(dialog).getByText('Update Reports?')).toBeTruthy();
      expect(d.getByText('The current values, kept with the new version; a value that no longer fits returns to its default.')).toBeTruthy();
      expect((d.getByLabelText('Refresh every') as HTMLInputElement).value).toBe('120');
      expect((d.getByLabelText('Heading') as HTMLInputElement).value).toBe('Ops');
      expect(d.getByRole('combobox', { name: 'Mode' }).textContent).toContain('compact');
      expect((d.getByLabelText('Window') as HTMLInputElement).value).toBe('15m');
      expect(requests('GET', `${API}/installed/%40qodalis%2Fcli-dashboard-module-reports/config`)).toHaveLength(1);
    });

    it('sends only what changed from the current values, and names the settings it reset', async () => {
      server.action = () => json({ name: REPORTS.name, version: '2.0.0', configDropped: ['mode', 'gone'] });
      const dialog = await openUpdate();
      const d = within(dialog);
      fireEvent.change(d.getByLabelText('Refresh every'), { target: { value: '300' } });
      fireEvent.change(d.getByLabelText('Heading'), { target: { value: 'Ops' } });
      fireEvent.click(await confirmButton(dialog, 'Update'));
      expect(await screen.findByText('Reports updated. Settings that no longer fit the new version returned to their defaults: mode, gone.')).toBeTruthy();
      expect(requests('PUT', `${API}/installed/`).map(r => JSON.parse(r.body ?? '{}'))).toEqual([{ config: { refreshSeconds: 300 } }]);
    });

    it('says only "updated" when nothing was reset', async () => {
      server.action = () => json({ name: REPORTS.name, version: '2.0.0', configDropped: [] });
      const dialog = await openUpdate();
      fireEvent.click(await confirmButton(dialog, 'Update'));
      expect(await screen.findByText('Reports updated.')).toBeTruthy();
      expect(requests('PUT', `${API}/installed/`).map(r => r.body)).toEqual(['{}']);
    });

    it('blocks Update while a setting is invalid', async () => {
      const dialog = await openUpdate();
      fireEvent.change(within(dialog).getByLabelText('Refresh every'), { target: { value: '9999' } });
      expect(within(field(dialog, 'refreshSeconds')).getByRole('alert').textContent).toBe('At most 3,600');
      expect(await confirmButton(dialog, 'Update')).toHaveProperty('disabled', true);
    });

    it('shows no fields when the current values cannot be read: defaults there would misstate them', async () => {
      server.details = withSettings('2.0.0');
      renderPage();
      fireEvent.click(await (await findCard('Reports')).findByRole('button', { name: 'Update' }));
      const dialog = await findDialog();
      expect(await within(dialog).findByRole('note')).toBeTruthy();
      expect(within(dialog).queryByLabelText('Refresh every')).toBeNull();
      fireEvent.click(await confirmButton(dialog, 'Update'));
      expect(await screen.findByText('Reports updated.')).toBeTruthy();
      expect(requests('PUT', `${API}/installed/`).map(r => r.body)).toEqual(['{}']);
    });
  });

  describe('details', () => {
    it('lists the settings: key, type, default and rule', async () => {
      server.details = withSettings('0.3.0');
      renderPage();
      fireEvent.click(await (await findCard('Kanban')).findByRole('button', { name: 'Details of Kanban' }));
      const dialog = within(await screen.findByRole('dialog', { name: 'Kanban' }));
      const table = await dialog.findByRole('table');
      expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Key', 'Type', 'Default', 'Rule']);
      const rowOf = (key: string) => within(table.querySelector(`[data-setting="${key}"]`) as HTMLElement).getAllByRole('cell').map(c => c.textContent);
      const header = (key: string) => (table.querySelector(`[data-setting="${key}"] th`) as HTMLElement).textContent;
      expect(header('refreshSeconds')).toBe('refreshSecondsRefresh everySeconds between reloads');
      expect(rowOf('refreshSeconds')).toEqual(['number', '30', '5 to 3,600']);
      expect(rowOf('columns')).toEqual(['string[]', 'name, status', '1 to 5 items']);
      expect(rowOf('mode')).toEqual(['enum', 'compact', 'one of compact, full']);
      expect(rowOf('heading')).toEqual(['string', 'Jobs', 'required · length at most 10']);
      expect(rowOf('homepage')).toEqual(['url', 'https://jobs.example', '—']);
      expect(rowOf('window')).toEqual(['duration', '15m', 'at least 1m']);
      expect(rowOf('filters')).toEqual(['json', '{"failed":true}', '—']);
      expect(rowOf('compact')).toEqual(['boolean', 'false', '—']);
    });

    it('says when the plugin has no settings', async () => {
      server.details = withSettings('0.3.0', []);
      renderPage();
      fireEvent.click(await (await findCard('Kanban')).findByRole('button', { name: 'Details of Kanban' }));
      const dialog = within(await screen.findByRole('dialog', { name: 'Kanban' }));
      expect(await dialog.findByText('No settings.')).toBeTruthy();
      expect(dialog.queryByRole('table')).toBeNull();
    });
  });

  describe('the link to the settings of an installed plugin', () => {
    const INSTALLED = [
      { name: '@acme/dashboard-kanban', version: '0.3.0', title: 'Kanban', id: 'kanban' },
      { name: '@qodalis/cli-dashboard-module-reports', version: '2.0.0', title: 'Reports', id: 'reports' },
    ];
    const overview = (sections: string[]) => () => json({
      providers: [{ id: 'dashboard-plugins', title: 'Dashboard plugins', description: '', order: 3, writable: true,
        sections: sections.map(id => ({ id, title: id, description: '', mutable: true, version: '1', allowCustomKeys: false, entries: [] })) }],
    });

    it('opens its section on the Config page, for plugins that have one', async () => {
      server.installed = INSTALLED;
      server.configOverview = overview(['kanban']);
      renderPage('/plugins');
      const link = await (await findCard('Kanban')).findByRole('link', { name: 'Configure Kanban' });
      expect(link.getAttribute('href')).toBe('/config?provider=dashboard-plugins&section=kanban');
      expect(link.textContent).toBe('Configure');
      expect(card('Reports').queryByRole('link', { name: 'Configure Reports' })).toBeNull();
      expect(card('Reports').getByText('No settings.')).toBeTruthy();
      fireEvent.click(link);
      expect(location()).toBe('/config?provider=dashboard-plugins&section=kanban');
    });

    it('is there without dashboard:install too', async () => {
      server.installed = INSTALLED;
      server.permissions = ['admin:access'];
      server.configOverview = overview(['kanban', 'reports']);
      renderPage('/plugins');
      expect(await (await findCard('Reports')).findByRole('link', { name: 'Configure Reports' })).toBeTruthy();
      await sessionLoaded();
      expect(card('Kanban').getByRole('link', { name: 'Configure Kanban' })).toBeTruthy();
      expect(card('Kanban').queryByRole('button')).toBeNull();
    });

    it('is on every card when the settings cannot be read', async () => {
      server.installed = INSTALLED;
      renderPage('/plugins');
      expect(await (await findCard('Kanban')).findByRole('link', { name: 'Configure Kanban' })).toBeTruthy();
      expect(card('Reports').getByRole('link', { name: 'Configure Reports' })).toBeTruthy();
    });
  });
});

describe('Marketplace actions: the server\'s failure is shown', () => {
  const EACCES = 'cannot write the plugins folder /app/server/qcli-data/dashboard-plugins: permission denied (EACCES). Set dataDir (or QCLI_DATA_DIR) to a writable folder';
  const INSTALLED = [
    { name: '@acme/dashboard-kanban', version: '0.3.0', title: 'Kanban', id: 'kanban', updateAvailable: true, hasConfig: false },
  ];
  let scrolled: Element[];
  beforeEach(() => {
    scrolled = [];
    // jsdom has no layout: record what is brought into view
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this); };
  });
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  async function installFails(answer: () => Response) {
    server.action = answer;
    renderPage();
    fireEvent.click(await (await findCard('Jobs board')).findByRole('button', { name: 'Install' }));
    const dialog = await findDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Install' }));
    const alert = await within(dialog).findByRole('alert');
    return { dialog, alert };
  }

  it('install, 500 with { error }: the server\'s message in the dialog, brought into view', async () => {
    const { dialog, alert } = await installFails(() => json({ error: EACCES }, 500));
    expect(alert.textContent).toBe(`Could not install Jobs board${EACCES}`);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(scrolled.some(el => el.contains(alert))).toBe(true);
  });

  it('install, 500 without a body: "The server answered 500" and the status text', async () => {
    const { alert } = await installFails(() => new Response(null, { status: 500, statusText: 'Internal Server Error' }));
    expect(alert.textContent).toContain('The server answered 500 Internal Server Error');
  });

  it('install, 500 without a body over HTTP/2 (no status text): the standard phrase', async () => {
    const { alert } = await installFails(() => new Response(null, { status: 500 }));
    expect(alert.textContent).toContain('The server answered 500 Internal Server Error');
  });

  it("install, a proxy's HTML error page: the status, not the page", async () => {
    const { alert } = await installFails(() => new Response('<html><body><h1>500</h1></body></html>', { status: 500, statusText: 'Internal Server Error' }));
    expect(alert.textContent).toContain('The server answered 500 Internal Server Error');
    expect(alert.textContent).not.toContain('<html>');
  });

  it('update from the Marketplace tab: in the dialog', async () => {
    server.action = () => json({ error: EACCES }, 500);
    renderPage();
    fireEvent.click(await (await findCard('Reports')).findByRole('button', { name: 'Update' }));
    const dialog = await findDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }));
    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain('Could not update Reports');
    expect(alert.textContent).toContain(EACCES);
  });

  it('remove from the Marketplace tab: on the page, brought into view', async () => {
    server.action = () => new Response(null, { status: 500, statusText: '' });
    renderPage();
    fireEvent.click(await (await findCard('Reports')).findByRole('button', { name: 'Remove' }));
    fireEvent.click(within(await findDialog()).getByRole('button', { name: 'Remove' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not remove Reports');
    expect(alert.textContent).toContain('The server answered 500 Internal Server Error');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(scrolled.some(el => el.contains(alert))).toBe(true);
  });

  it('update from the Installed tab: in the dialog', async () => {
    server.installed = INSTALLED;
    server.action = () => json({ error: EACCES }, 500);
    renderPage('/plugins');
    fireEvent.click(await (await findCard('Kanban')).findByRole('button', { name: 'Update' }));
    const dialog = await findDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update' }));
    expect((await within(dialog).findByRole('alert')).textContent).toContain(EACCES);
  });

  it('remove from the Installed tab: on the page, brought into view', async () => {
    server.installed = INSTALLED;
    server.action = () => json({ error: EACCES }, 500);
    renderPage('/plugins');
    fireEvent.click(await (await findCard('Kanban')).findByRole('button', { name: 'Remove' }));
    fireEvent.click(within(await findDialog()).getByRole('button', { name: 'Remove' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(`Could not remove Kanban${EACCES}`);
    expect(scrolled.some(el => el.contains(alert))).toBe(true);
    // The card is still there
    expect(card('Kanban').getByRole('button', { name: 'Remove' })).toBeTruthy();
  });
});

describe('Installed tab: settings of the plugins', () => {
  const overview = (sections: string[]) => () => json({
    providers: [{ id: 'dashboard-plugins', title: 'Dashboard plugins', description: '', order: 3, writable: true,
      sections: sections.map(id => ({ id, title: id, description: '', mutable: true, version: '1', allowCustomKeys: false, entries: [] })) }],
  });

  it('Configure for a plugin whose version declares settings (hasConfig), even before its section is listed', async () => {
    server.installed = [{ name: '@acme/dashboard-kanban', version: '0.3.0', title: 'Kanban', id: 'kanban', hasConfig: true }];
    server.configOverview = overview([]);
    renderPage('/plugins');
    const link = await (await findCard('Kanban')).findByRole('link', { name: 'Configure Kanban' });
    expect(link.getAttribute('href')).toBe('/config?provider=dashboard-plugins&section=kanban');
    fireEvent.click(link);
    expect(location()).toBe('/config?provider=dashboard-plugins&section=kanban');
  });

  it('a quiet "No settings." for a plugin without any (the data explorer), also when the settings cannot be read', async () => {
    server.installed = [{ name: '@qodalis/cli-dashboard-module-data-explorer', version: '1.0.0', title: 'Data explorer', id: 'data-explorer', hasConfig: false }];
    renderPage('/plugins');
    const explorer = await findCard('Data explorer');
    expect(await explorer.findByText('No settings.')).toBeTruthy();
    expect(explorer.queryByRole('link', { name: /Configure/ })).toBeNull();
  });

  it('Configure for a plugin added in code that has settings', async () => {
    server.packages = [
      { id: '@acme/cli-server-plugin-tickets', name: 'Tickets', version: '1.0.0', source: 'code', settings: 'helpdesk' },
      { id: '@acme/cli-server-plugin-plain', name: 'Plain', version: '1.0.0', source: 'code' },
    ];
    renderPage('/plugins');
    const link = await (await findCard('Tickets')).findByRole('link', { name: 'Configure Tickets' });
    expect(link.getAttribute('href')).toBe('/config?provider=helpdesk');
    expect(card('Plain').queryByRole('link', { name: /Configure/ })).toBeNull();
  });
});

describe('Installing a dashboard plugin whose server plugin is missing', () => {
  const EXPLORER = {
    name: '@qodalis/cli-dashboard-module-data-explorer', title: 'Data explorer', description: 'SQL', icon: '🔎',
    publisher: { id: 'qodalis', name: 'Qodalis', verified: true }, latest: '1.0.0', installed: null, updateAvailable: false,
    allowed: true, requires: { serverPackage: '@qodalis/cli-server-plugin-data-explorer', installed: false },
  };
  const DETAILS = {
    ...EXPLORER, readme: '', versions: [{ version: '1.0.0', dashboardApi: 1, files: [] }],
    serverPackages: [
      { ecosystem: 'npm', name: '@qodalis/cli-server-plugin-data-explorer' },
      { ecosystem: 'pypi', name: 'qodalis-cli-server-plugin-data-explorer' },
    ],
  };
  const SERVER_ITEM = {
    name: 'data-explorer', kind: 'server', title: 'Data explorer server', description: '', publisher: { name: 'qodalis', verified: true },
    platforms: { node: { package: '@qodalis/cli-server-plugin-data-explorer', registry: 'npm', latest: '1.0.0' } },
    platform: { package: '@qodalis/cli-server-plugin-data-explorer', latest: '1.0.0', installed: null, compatible: true },
    latest: '1.0.0', compatible: true, otherPlatforms: [], autoInstall: true, updateAvailable: false, allowed: true, installed: null,
  };
  const marketOn = (method: string, path: string) => {
    if (method === 'POST' && path.endsWith('/server/marketplace/installed')) {
      return json({ name: 'data-explorer', package: SERVER_ITEM.platform.package, version: '1.0.0', status: 'pending', restartRequired: true }, 202);
    }
    if (path.endsWith('/server/marketplace/plugins')) return json({ items: [SERVER_ITEM], total: 1, page: 1, pageSize: 50 });
    return json({ marketplaceUrl: 'https://plugins.qodalis.com', install: 'verified', platform: 'node', serverVersion: '1.0.0', enabled: true });
  };

  beforeEach(() => {
    server.items = [EXPLORER];
    server.details = () => json(DETAILS);
    server.action = () => json({ name: EXPLORER.name, version: '1.0.0' }, 201);
  });

  async function openInstall() {
    renderPage();
    await sessionLoaded();
    fireEvent.click(await (await findCard('Data explorer')).findByRole('button', { name: 'Install' }));
    const dialog = await findDialog();
    return within(await within(dialog).findByTestId('server-plugin-needed')).getByText(/needs the server plugin/).closest('[data-testid="server-plugin-needed"]') as HTMLElement;
  }

  it('says so and installs the server plugin too when this server can (the default), then says to restart', async () => {
    server.serverMarket = marketOn;
    const note = await openInstall();
    expect(note.textContent).toContain('Data explorer needs the server plugin @qodalis/cli-server-plugin-data-explorer, which is not installed on this server.');
    const box = await within(note).findByRole('checkbox', { name: /Also install the server plugin Data explorer server/ });
    expect((box as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Install' }));
    expect(await screen.findByText('Data explorer installed. The server plugin Data explorer server is installed too: restart the server to load it.')).toBeTruthy();
    expect(requests('POST', `${API}/installed`)).toHaveLength(1);
    const serverInstall = requests('POST', '/api/v1/qcli/server/marketplace/installed');
    expect(serverInstall.map(r => JSON.parse(r.body!))).toEqual([{ name: 'data-explorer' }]);
  });

  it('installs the page alone when the box is cleared', async () => {
    server.serverMarket = marketOn;
    const note = await openInstall();
    fireEvent.click(await within(note).findByRole('checkbox'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Install' }));
    expect(await screen.findByText('Data explorer installed: its page is in the navigation.')).toBeTruthy();
    expect(requests('POST', '/api/v1/qcli/server/marketplace/installed')).toHaveLength(0);
  });

  it('explains the code way when this server cannot install it, and still installs the page', async () => {
    const note = await openInstall();
    expect(await within(note).findByText(/add it in the server’s code/)).toBeTruthy();
    expect(note.textContent).toContain('npm: @qodalis/cli-server-plugin-data-explorer');
    expect(note.textContent).toContain('pypi: qodalis-cli-server-plugin-data-explorer');
    expect(note.textContent).toContain('You can install the page now');
    expect(within(note).queryByRole('checkbox')).toBeNull();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Install' }));
    expect(await screen.findByText('Data explorer installed: its page is in the navigation.')).toBeTruthy();
  });

  it('explains the code way without plugins:install', async () => {
    server.serverMarket = marketOn;
    server.permissions = ['admin:access', 'dashboard:install'];
    const note = await openInstall();
    expect(await within(note).findByText(/add it in the server’s code/)).toBeTruthy();
    expect(requests('GET', '/api/v1/qcli/server/marketplace')).toHaveLength(0);
  });

  it('reports a server plugin that fails to install, the page installed', async () => {
    server.serverMarket = (method, path) => (method === 'POST' ? json({ error: 'npm registry unreachable' }, 502) : marketOn(method, path));
    const note = await openInstall();
    await within(note).findByRole('checkbox');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Install' }));
    const failure = await screen.findByTestId('action-failure');
    expect(failure.textContent).toContain('Data explorer installed, but the server plugin Data explorer server could not be installed');
  });

  it('says nothing about it when the server plugin is installed', async () => {
    server.items = [{ ...EXPLORER, requires: { ...EXPLORER.requires, installed: true } }];
    renderPage();
    fireEvent.click(await (await findCard('Data explorer')).findByRole('button', { name: 'Install' }));
    const dialog = await findDialog();
    expect(within(dialog).queryByTestId('server-plugin-needed')).toBeNull();
  });
});
