// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import PluginsPage from './PluginsPage';
import { AuthProvider } from '../../context/AuthContext';
import { ExtensionsProvider } from '../../context/ExtensionsContext';
import { WebSocketProvider } from '../../context/WebSocketContext';
import { RestartProvider } from '../../context/RestartContext';
import RestartBanner from '../../components/RestartBanner';
import { I18nProvider, LOCALES } from '../../i18n';
import { setToken } from '../../api/client';
import { ownPlatform, readServerPluginItem, serverPluginSettingsPath } from '../../api/serverMarketplace';
import serverMessages from '../../i18n/messages/serverMarketplace';
import { FakeWebSocket } from '../../test/fakes';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const API = '/api/v1/qcli/server/marketplace';
const DASH = '/api/v1/qcli/dashboard/marketplace';

const QODALIS = { id: '@qodalis', name: 'qodalis', verified: true };
const platforms = (name: string, latest = '1.1.0') => ({
  node: { package: `@qodalis/cli-server-plugin-${name}`, registry: 'npm', latest, install: `npm install @qodalis/cli-server-plugin-${name}` },
  python: { package: `qodalis-cli-server-plugin-${name}`, registry: 'pypi', latest: '1.0.0b31', install: `pip install qodalis-cli-server-plugin-${name}` },
  dotnet: { package: `Qodalis.Cli.Plugin.${name[0].toUpperCase()}${name.slice(1)}`, registry: 'nuget', latest: '1.0.0-beta.31' },
});

const WEATHER = {
  name: 'weather', kind: 'server', title: 'Weather', icon: '🌤️', description: 'The weather plugin', publisher: QODALIS,
  platforms: platforms('weather'), latest: '1.1.0', compatible: true,
  platform: { package: '@qodalis/cli-server-plugin-weather', latest: '1.1.0', installed: null, compatible: true },
  otherPlatforms: ['python', 'dotnet'], autoInstall: true, updateAvailable: false, allowed: true,
};
const JOBS = {
  ...WEATHER, name: 'jobs', title: 'Jobs', description: 'Background jobs', platforms: platforms('jobs'),
  platform: { package: '@qodalis/cli-server-plugin-jobs', latest: '1.1.0', installed: '1.0.0', compatible: true }, updateAvailable: true,
};
const PYONLY = {
  name: 'pyonly', kind: 'server', title: 'Py only', description: 'Python only', publisher: QODALIS,
  platforms: { python: platforms('pyonly').python }, platform: null, otherPlatforms: ['python'],
  autoInstall: true, updateAvailable: false, allowed: false, blockedReason: 'not available for node',
};
const OLD = {
  ...WEATHER, name: 'old', title: 'Old', platforms: platforms('old'), compatible: false,
  platform: { package: '@qodalis/cli-server-plugin-old', latest: null, installed: null, compatible: false, reason: 'needs server ^99.0.0 (this server has 1.0.0-beta.31)' },
  allowed: false, blockedReason: 'needs server ^99.0.0 (this server has 1.0.0-beta.31)',
};
const PORTAL = {
  ...WEATHER, name: 'portal', title: 'Portal', platforms: platforms('portal'), homepage: 'https://github.com/qodalis-solutions/portal#readme',
  platform: { package: '@qodalis/cli-server-plugin-portal', latest: '1.1.0', installed: null, compatible: true },
  autoInstall: false, autoInstallReason: 'needs the host’s auth and routes', allowed: false, blockedReason: 'needs setup in code',
};
const ACME = {
  ...WEATHER, name: 'acme', title: 'Acme', publisher: { name: 'acme', verified: false }, platforms: platforms('acme'),
  platform: { package: '@qodalis/cli-server-plugin-acme', latest: '1.1.0', installed: null, compatible: true },
  allowed: false, blockedReason: 'unverified publisher',
};

const INSTALLED = [
  { name: 'jobs', package: '@qodalis/cli-server-plugin-jobs', version: '1.0.0', title: 'Jobs', icon: '⏱', installedAt: '2026-11-25T10:00:00Z', installedBy: 'admin', status: 'loaded', loadedVersion: '1.0.0', updateAvailable: true },
  { name: 'weather', package: '@qodalis/cli-server-plugin-weather', version: '1.1.0', title: 'Weather', installedBy: 'admin', status: 'pending', loadedVersion: '1.0.0' },
  { name: 'broken', package: '@acme/cli-server-plugin-broken', version: '0.1.0', title: 'Broken', status: 'failed', loadedVersion: null, error: 'Cannot find module ./plugin.js' },
  { name: 'mailer', package: '@qodalis/cli-server-plugin-mailer', version: '1.0.0', title: 'Mailer', status: 'needs-configuration', loadedVersion: null, missing: ['smtp.host', 'smtp.password'], settings: 'mailer-plugin' },
  { name: 'gone', package: '@qodalis/cli-server-plugin-gone', version: '1.0.0', title: 'Gone', status: 'removed', loadedVersion: '1.0.0' },
];

interface Server {
  info: () => Response;
  items: unknown[];
  /** Answers GET /plugins instead of the items. */
  list?: () => Response;
  details: (name: string) => Response;
  installed: unknown[];
  hostPackages: unknown[];
  permissions: string[];
  restart: () => Response;
  action: (method: string, url: string, body?: string) => Response | Promise<Response>;
  requests: Array<{ method: string; url: string; body?: string }>;
}

let server: Server;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  setToken('tok');
  FakeWebSocket.install();
  server = {
    info: () => json({ marketplaceUrl: 'https://plugins.qodalis.com', install: 'verified', platform: 'node', serverVersion: '1.0.0-beta.31', enabled: true }),
    items: [WEATHER, JOBS, PYONLY, OLD, PORTAL, ACME],
    details: () => json({ error: 'plugin not found' }, 404),
    installed: [],
    hostPackages: [],
    permissions: ['*'],
    restart: () => json({ supported: true, mode: 'exit', supervisor: 'docker', startedAt: '2026-11-25T09:00:00Z', pending: [] }),
    action: () => json({ ...INSTALLED[1], restartRequired: true }, 202),
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
    if (path.endsWith('/dashboard/extensions')) return json({ extensions: [] });
    if (path === '/api/v1/qcli/server/restart') return server.restart();
    if (path.startsWith(DASH)) {
      if (path === DASH) return json({ marketplaceUrl: 'https://plugins.qodalis.com', install: 'verified', dashboardApi: 1 });
      if (path === `${DASH}/plugins`) return json({ items: [{ name: '@qodalis/cli-dashboard-module-jobs', title: 'Jobs board', publisher: QODALIS, latest: '1.0.0', allowed: true }], total: 1 });
      return json([]);
    }
    if (method !== 'GET' && path.startsWith(`${API}/installed`)) return server.action(method, url, init?.body as string | undefined);
    if (path === API) return server.info();
    if (path === `${API}/plugins`) return server.list ? server.list() : json({ items: server.items, total: server.items.length, page: 1, pageSize: 20 });
    if (path.startsWith(`${API}/plugins/`)) return server.details(decodeURIComponent(path.slice(`${API}/plugins/`.length)));
    if (path === `${API}/installed`) return json(server.installed);
    if (path.endsWith('/plugins/installed')) return json(server.hostPackages);
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

function renderPage(path = '/plugins?tab=marketplace&kind=server') {
  const [pathname, search] = path.split('?');
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[{ pathname, search: search ? `?${search}` : '' }]}>
        <AuthProvider>
          <WebSocketProvider>
            <ExtensionsProvider>
              <RestartProvider>
                <RestartBanner />
                <PluginsPage />
                <Location />
              </RestartProvider>
            </ExtensionsProvider>
          </WebSocketProvider>
        </AuthProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

const location = () => screen.getByTestId('location').textContent;
const findCard = async (title: string) => within(await screen.findByRole('article', { name: title }));
const card = (title: string) => within(screen.getByRole('article', { name: title }));
const requests = (method: string, part: string) => server.requests.filter(r => r.method === method && r.url.includes(part));
const sessionLoaded = () => waitFor(() => expect(requests('GET', '/sessions/current').length).toBeGreaterThan(0));
const restartLoaded = () => waitFor(() => expect(requests('GET', '/server/restart').length).toBeGreaterThan(0));

async function openSocket() {
  await waitFor(() => expect(FakeWebSocket.live.length).toBeGreaterThan(0));
  const socket = FakeWebSocket.live[FakeWebSocket.live.length - 1];
  act(() => socket.open());
  return socket;
}

/** Clicks the card's button and confirms the dialog. */
async function confirmAction(title: string, button: string) {
  await sessionLoaded();
  fireEvent.click((await findCard(title)).getByRole('button', { name: button }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: button }));
  return dialog;
}

describe('Marketplace kind switch', () => {
  it('shows dashboard plugins by default and switches to server plugins in the URL', async () => {
    renderPage('/plugins?tab=marketplace');
    const dashboard = screen.getByRole('button', { name: 'Dashboard plugins' });
    expect(dashboard.getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByRole('article', { name: 'Jobs board' })).toBeTruthy();
    expect(requests('GET', `${API}/plugins`)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Server plugins' }));
    expect(location()).toBe('/plugins?tab=marketplace&kind=server');
    expect(await screen.findByRole('article', { name: 'Weather' })).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Jobs board' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Server plugins' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard plugins' }));
    expect(location()).toBe('/plugins?tab=marketplace');
  });

  it('opens server plugins from ?kind=server, and the Installed tab drops the kind', async () => {
    renderPage();
    expect(await screen.findByRole('article', { name: 'Weather' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Installed' }));
    expect(location()).toBe('/plugins');
  });

  it('reads an unknown kind as dashboard plugins', async () => {
    renderPage('/plugins?tab=marketplace&kind=nope');
    expect(screen.getByRole('button', { name: 'Dashboard plugins' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('notes a server without the server marketplace', async () => {
    server.info = () => json({ error: 'not found' }, 404);
    renderPage();
    expect(await screen.findByText('This server does not install server plugins from the marketplace.')).toBeTruthy();
    expect(requests('GET', `${API}/plugins`)).toHaveLength(0);
  });

  it('notes runtime server plugins turned off', async () => {
    server.info = () => json({ marketplaceUrl: 'https://m', install: 'verified', platform: 'node', enabled: false });
    renderPage();
    expect(await screen.findByText(/turned off on this server: you can browse/)).toBeTruthy();
  });
});

describe('Server plugin cards', () => {
  it('shows Node, Python and .NET with this server’s platform highlighted', async () => {
    renderPage();
    const weather = await findCard('Weather');
    const badges = within(weather.getByRole('list', { name: 'Platforms' })).getAllByRole('listitem');
    expect(badges.map(b => b.textContent)).toEqual(['Node', 'Python', '.NET']);
    expect(badges.map(b => b.getAttribute('aria-current'))).toEqual(['true', null, null]);
    expect(badges.map(b => b.getAttribute('data-available'))).toEqual(['true', 'true', 'true']);
    expect(badges[0].getAttribute('aria-label')).toBe('Node: this server');
    expect(weather.getByText('@qodalis/cli-server-plugin-weather')).toBeTruthy();
    expect(weather.getByText('v1.1.0')).toBeTruthy();
    expect(weather.getByText('by qodalis')).toBeTruthy();
  });

  it('highlights the platform the server names (a Python server)', async () => {
    server.info = () => json({ marketplaceUrl: 'https://m', install: 'verified', platform: 'python', enabled: true });
    server.items = [{ ...WEATHER, platform: { ...WEATHER.platform, package: 'qodalis-cli-server-plugin-weather' } }];
    renderPage();
    const badges = within((await findCard('Weather')).getByRole('list', { name: 'Platforms' })).getAllByRole('listitem');
    expect(badges.map(b => b.getAttribute('aria-current'))).toEqual([null, 'true', null]);
  });

  it('shows the installed version and an available update', async () => {
    renderPage();
    const jobs = await findCard('Jobs');
    expect(jobs.getByText('Installed: v1.0.0')).toBeTruthy();
    expect(jobs.getByText('Update available')).toBeTruthy();
    expect(jobs.getByRole('button', { name: 'Update' })).toBeTruthy();
    expect(jobs.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(jobs.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('says a plugin is not available for this platform, its Node badge struck', async () => {
    renderPage('/plugins?tab=marketplace&kind=server&platform=all');
    const py = await findCard('Py only');
    expect(py.getByText('Not available for Node')).toBeTruthy();
    const badges = within(py.getByRole('list', { name: 'Platforms' })).getAllByRole('listitem');
    expect(badges.map(b => b.getAttribute('data-available'))).toEqual(['false', 'true', 'false']);
    expect(badges[0].getAttribute('aria-label')).toBe('Node: this server, no package');
    const install = py.getByRole('button', { name: 'Install' });
    expect(install.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(install);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows an incompatible plugin with the reason, its install blocked', async () => {
    renderPage();
    const old = await findCard('Old');
    expect(old.getByText('Incompatible: needs server ^99.0.0 (this server has 1.0.0-beta.31)')).toBeTruthy();
    expect(old.getByRole('button', { name: 'Install' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('shows Needs setup in code with its reason and a link to its README', async () => {
    renderPage();
    const portal = await findCard('Portal');
    const note = portal.getByTestId('setup-note');
    expect(within(note).getByText('⚙ Needs setup in code')).toBeTruthy();
    expect(within(note).getByText('needs the host’s auth and routes')).toBeTruthy();
    const link = within(note).getByRole('link', { name: /How to set it up/ });
    expect(link.getAttribute('href')).toBe('https://github.com/qodalis-solutions/portal#readme');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(portal.getByRole('button', { name: 'Install' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('links the marketplace page when the plugin has no homepage', async () => {
    server.items = [{ ...PORTAL, homepage: undefined }];
    renderPage();
    const link = (await findCard('Portal')).getByRole('link', { name: /How to set it up/ });
    expect(link.getAttribute('href')).toBe('https://plugins.qodalis.com/plugins/portal');
  });

  it('keeps an unverified publisher’s install blocked with the reason as tooltip', async () => {
    renderPage();
    const acme = await findCard('Acme');
    const install = acme.getByRole('button', { name: 'Install' });
    expect(install.getAttribute('aria-disabled')).toBe('true');
    fireEvent.focus(install);
    expect(await screen.findByText('The publisher is not verified')).toBeTruthy();
  });

  it('reloads the list on server:plugins-changed', async () => {
    renderPage();
    await findCard('Weather');
    const socket = await openSocket();
    const before = requests('GET', `${API}/plugins`).length;
    act(() => socket.emit({ type: 'server:plugins-changed' }));
    await waitFor(() => expect(requests('GET', `${API}/plugins`).length).toBeGreaterThan(before));
  });
});

describe('Server plugins added in code', () => {
  // The host adds weather (an older version) and portal in code; jobs is installed from the marketplace
  const CODE_WEATHER = { ...WEATHER, installed: { version: '1.0.0', source: 'code' }, updateAvailable: true };
  const CODE_PORTAL = { ...PORTAL, installed: { version: null, source: 'code' } };
  const MARKET_JOBS = { ...JOBS, installed: { version: '1.0.0', source: 'marketplace' } };

  it('shows them as added in code with their version, no Install, Update or Remove; marketplace installs keep theirs', async () => {
    server.items = [CODE_WEATHER, CODE_PORTAL, MARKET_JOBS];
    renderPage();
    await sessionLoaded();
    const weather = await findCard('Weather');
    expect(weather.getByText('Added in code · v1.0.0')).toBeTruthy();
    expect(weather.getByText('Newer version v1.1.0 in the marketplace; update it in code')).toBeTruthy();
    expect(weather.getAllByRole('button').map(b => b.textContent)).toEqual(['Details']);
    // needs setup in code, already done: no setup note
    expect(card('Portal').getByText('Added in code')).toBeTruthy();
    expect(card('Portal').queryByTestId('setup-note')).toBeNull();
    expect(card('Portal').getAllByRole('button').map(b => b.textContent)).toEqual(['Details']);
    const jobs = card('Jobs');
    expect(jobs.getByText('Installed: v1.0.0')).toBeTruthy();
    expect(jobs.getByRole('button', { name: 'Update' })).toBeTruthy();
    expect(jobs.getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('says so in the details dialog', async () => {
    server.items = [CODE_WEATHER];
    server.details = () => json({ ...CODE_WEATHER, readme: '', versions: [] });
    renderPage();
    fireEvent.click((await findCard('Weather')).getByRole('button', { name: 'Details of Weather' }));
    const dialog = within(await screen.findByRole('dialog'));
    const state = within(await dialog.findByTestId('install-state'));
    expect(state.getByText('Added in code · v1.0.0')).toBeTruthy();
    expect(state.getByText('Newer version v1.1.0 in the marketplace; update it in code')).toBeTruthy();
  });
});

describe('Server plugin filters', () => {
  const chips = (name: string) => within(screen.getByRole('group', { name }));
  const titles = () => screen.getAllByRole('article').map(a => a.getAttribute('aria-label'));

  it('shows this server’s plugins by default; All platforms and a platform in the URL', async () => {
    renderPage();
    await findCard('Weather');
    const platform = chips('Platform');
    expect(platform.getByRole('button', { name: 'This server (Node)' }).getAttribute('aria-pressed')).toBe('true');
    // Py only has no Node package: left out by default
    expect(titles()).not.toContain('Py only');
    expect(titles()).toContain('Weather');

    fireEvent.click(platform.getByRole('button', { name: 'All platforms' }));
    expect(location()).toContain('platform=all');
    expect(await findCard('Py only')).toBeTruthy();

    fireEvent.click(platform.getByRole('button', { name: 'This server (Node)' }));
    expect(location()).not.toContain('platform=');
    expect(titles()).not.toContain('Py only');
  });

  it('reads the platform from the URL; another platform is shown but not installable here, its details on that tab', async () => {
    server.permissions = ['*'];
    server.details = () => json({ ...WEATHER, readme: '# Weather', versions: [{ version: '1.0.0b31', platform: 'python', package: 'qodalis-cli-server-plugin-weather' }] });
    renderPage('/plugins?tab=marketplace&kind=server&platform=python');
    await sessionLoaded();
    expect(chips('Platform').getByRole('button', { name: 'Python' }).getAttribute('aria-pressed')).toBe('true');
    const py = await findCard('Py only');
    expect(py.getByText('Not installable here')).toBeTruthy();
    expect(py.getByTestId('other-platform').textContent).toBe('For Python: this server runs Node, so it cannot install it here.');
    expect(py.getByText('qodalis-cli-server-plugin-pyonly')).toBeTruthy();
    expect(py.queryByText('Not available for Node')).toBeNull();
    const weather = card('Weather');
    expect(weather.getAllByRole('button').map(b => b.textContent)).toEqual(['Details']);
    fireEvent.click(weather.getByRole('button', { name: 'Details of Weather' }));
    const tabs = within(await screen.findByRole('tablist', { name: 'Platform' }));
    expect(tabs.getByRole('tab', { name: 'Python' }).getAttribute('aria-selected')).toBe('true');
  });

  it('this server’s platform chosen by name works as the default: installable', async () => {
    renderPage('/plugins?tab=marketplace&kind=server&platform=node');
    await sessionLoaded();
    const weather = await findCard('Weather');
    expect(weather.getByRole('button', { name: 'Install' })).toBeTruthy();
    expect(weather.queryByTestId('other-platform')).toBeNull();
  });

  it('filters installed and not installed plugins, kept in the URL', async () => {
    renderPage();
    await findCard('Weather');
    const installed = chips('Installed or not');
    expect(installed.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(installed.getByRole('button', { name: 'Installed' }));
    expect(location()).toContain('installed=yes');
    await waitFor(() => expect(titles()).toEqual(['Jobs']));
    fireEvent.click(installed.getByRole('button', { name: 'Not installed' }));
    expect(location()).toContain('installed=no');
    await waitFor(() => expect(titles()).not.toContain('Jobs'));
    expect(titles()).toContain('Weather');
  });

  it('says when nothing matches the filters', async () => {
    server.items = [WEATHER];
    renderPage('/plugins?tab=marketplace&kind=server&installed=yes');
    expect(await screen.findByText('No plugins match these filters.')).toBeTruthy();
  });
});

describe('Server plugins: permission', () => {
  it('shows Install, Update and Remove with plugins:install', async () => {
    server.permissions = ['admin:access', 'plugins:install'];
    renderPage();
    await sessionLoaded();
    expect(await (await findCard('Weather')).findByRole('button', { name: 'Install' })).toBeTruthy();
    expect(card('Jobs').getByRole('button', { name: 'Update' })).toBeTruthy();
  });

  it('shows only Details without it, even with dashboard:install', async () => {
    server.permissions = ['admin:access', 'dashboard:install'];
    renderPage();
    await sessionLoaded();
    const weather = await findCard('Weather');
    await waitFor(() => expect(weather.queryByRole('button', { name: 'Install' })).toBeNull());
    expect(weather.getByRole('button', { name: 'Details of Weather' })).toBeTruthy();
    expect(card('Jobs').queryByRole('button', { name: 'Update' })).toBeNull();
    expect(card('Jobs').queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});

describe('Server plugins: install, update, remove', () => {
  it('asks first: full server rights, the publisher, the package and the restart', async () => {
    renderPage();
    await sessionLoaded();
    fireEvent.click((await findCard('Weather')).getByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Install Weather on the server?')).toBeTruthy();
    expect(within(dialog).getByText(/runs code inside the server process with its full rights/)).toBeTruthy();
    expect(within(dialog).getByText('qodalis')).toBeTruthy();
    expect(within(dialog).getByText('@qodalis/cli-server-plugin-weather@1.1.0')).toBeTruthy();
    expect(within(dialog).getByText('The change applies after the server restarts.')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(requests('POST', `${API}/installed`)).toHaveLength(0);
  });

  it('installs on confirm, then says to restart with Restart server', async () => {
    server.action = () => json({ ...INSTALLED[1], name: 'weather', version: '1.1.0', status: 'pending', restartRequired: true }, 202);
    renderPage();
    await restartLoaded();
    await confirmAction('Weather', 'Install');
    const notice = await screen.findByTestId('restart-notice');
    expect(within(notice).getByText('Weather 1.1.0 installed.')).toBeTruthy();
    expect(within(notice).getByText('Restart the server to apply.')).toBeTruthy();
    expect(JSON.parse(requests('POST', `${API}/installed`)[0].body!)).toEqual({ name: 'weather' });

    fireEvent.click(within(notice).getByRole('button', { name: 'Restart server' }));
    expect(await screen.findByText('Restart the server?')).toBeTruthy();
  });

  it('shows no Restart server button without server:restart', async () => {
    server.permissions = ['admin:access', 'plugins:install'];
    renderPage();
    await restartLoaded();
    await confirmAction('Weather', 'Install');
    const notice = await screen.findByTestId('restart-notice');
    expect(within(notice).getByText('Restart the server to apply.')).toBeTruthy();
    expect(within(notice).queryByRole('button', { name: 'Restart server' })).toBeNull();
  });

  it('shows the restart banner live from server:restart-required', async () => {
    renderPage();
    await restartLoaded();
    await confirmAction('Weather', 'Install');
    await screen.findByTestId('restart-notice');
    const socket = await openSocket();
    act(() => socket.emit({ type: 'server:restart-required', pending: [{ id: 'plugin:weather', source: 'plugins', description: 'Install weather 1.1.0', since: '2026-11-25T10:00:00Z' }] }));
    expect(await screen.findByRole('region', { name: 'Restart required: 1 change takes effect after a restart' })).toBeTruthy();
  });

  it('updates with PUT and removes with DELETE after asking', async () => {
    server.action = (method) => json({ ...INSTALLED[0], version: method === 'PUT' ? '1.1.0' : '1.0.0', status: method === 'DELETE' ? 'removed' : 'pending', restartRequired: true, changed: true }, 202);
    renderPage();
    const dialog = await confirmAction('Jobs', 'Update');
    expect(within(dialog).getByText('Update Jobs on the server?')).toBeTruthy();
    expect(await screen.findByText('Jobs updated to 1.1.0.')).toBeTruthy();
    expect(requests('PUT', `${API}/installed/jobs`)).toHaveLength(1);

    fireEvent.click(card('Jobs').getByRole('button', { name: 'Remove' }));
    const remove = await screen.findByRole('dialog');
    expect(within(remove).getByText('Remove Jobs from the server?')).toBeTruthy();
    expect(within(remove).getByText(/@qodalis\/cli-server-plugin-jobs is uninstalled; it keeps running until the server restarts/)).toBeTruthy();
    fireEvent.click(within(remove).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Jobs removed.')).toBeTruthy();
    expect(requests('DELETE', `${API}/installed/jobs`)).toHaveLength(1);
  });

  it('says when an update found the same version, without a restart', async () => {
    server.action = () => json({ ...INSTALLED[0], restartRequired: false, changed: false }, 200);
    renderPage();
    await confirmAction('Jobs', 'Update');
    expect(await screen.findByText('Jobs already is 1.0.0.')).toBeTruthy();
    expect(screen.queryByTestId('restart-notice')).toBeNull();
  });

  it('opens the settings of a plugin installed without its required settings', async () => {
    server.action = () => json({ ...INSTALLED[3], name: 'weather', restartRequired: true }, 202);
    renderPage();
    await confirmAction('Weather', 'Install');
    await waitFor(() => expect(location()).toBe('/config?provider=mailer-plugin'));
  });

  const failures: Array<[string, number, string, string]> = [
    ['an unreachable marketplace (502)', 502, 'marketplace unreachable', 'The marketplace or the package registry cannot be reached: try again later.'],
    ['an integrity mismatch (502)', 502, 'integrity mismatch: sha512-abc', 'The downloaded package does not match its checksum: nothing was installed.'],
    ['an unverified publisher (403)', 403, 'publisher not verified', 'The publisher is not verified, and this server installs plugins of verified publishers only.'],
    ['a missing permission (403)', 403, 'forbidden: missing permission plugins:install', 'You are not allowed to install server plugins.'],
    ['an incompatible version (400)', 400, 'incompatible: @qodalis/cli-server-plugin-weather 1.1.0 needs server ^99.0.0 (this server has 1.0.0-beta.31)', 'Not compatible with this server: @qodalis/cli-server-plugin-weather 1.1.0 needs server ^99.0.0 (this server has 1.0.0-beta.31)'],
    ['autoInstall false (400)', 400, 'needs setup in code: needs the host’s auth', 'Needs setup in code: needs the host’s auth'],
    ['no package for this platform (400)', 400, 'not available for node', 'This plugin has no package for Node.'],
    ['the host’s own package (409)', 409, '@qodalis/cli-server-plugin-weather is installed by the host', 'The server already has this package from its own code.'],
  ];
  for (const [what, status, error, shown] of failures) {
    it(`reports ${what}`, async () => {
      server.action = () => json({ error }, status);
      renderPage();
      await confirmAction('Weather', 'Install');
      expect(await screen.findByText('Could not install Weather')).toBeTruthy();
      expect(screen.getByText(shown)).toBeTruthy();
      expect(screen.queryByTestId('restart-notice')).toBeNull();
    });
  }

  it('shows a failing list (502) with Retry', async () => {
    server.list = () => json({ error: 'marketplace unreachable' }, 502);
    renderPage();
    expect(await screen.findByText('Could not load the server plugins')).toBeTruthy();
    expect(screen.getByText('The marketplace or the package registry cannot be reached: try again later.')).toBeTruthy();
    server.list = undefined;
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(await screen.findByRole('article', { name: 'Weather' })).toBeTruthy();
  });
});

describe('Server plugin details', () => {
  const DETAILS = {
    ...WEATHER,
    readme: '# Weather\n\nCurrent weather and forecasts as commands.',
    versions: [
      { version: '1.0.0', platform: 'node', package: '@qodalis/cli-server-plugin-weather', serverRange: '^1.0.0-beta.3', status: 'listed' },
      { version: '1.1.0', platform: 'node', package: '@qodalis/cli-server-plugin-weather', serverRange: '^1.0.0-beta.30', status: 'listed', allowed: true },
      { version: '1.0.0b31', platform: 'python', package: 'qodalis-cli-server-plugin-weather', serverRange: '>=1.0.0b30', status: 'listed' },
    ],
    config: { entries: [{ key: 'units', label: 'Units', type: 'enum', default: 'metric', validation: { options: ['metric', 'imperial'] } }] },
  };

  it('switches between the platforms: this server’s by default; versions, install command and readme follow', async () => {
    server.details = () => json({
      ...DETAILS,
      platforms: { ...DETAILS.platforms, python: { ...DETAILS.platforms.python, readme: '# Weather for Python\n\npip it.', readmeFormat: 'markdown' } },
    });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage();
    fireEvent.click((await findCard('Weather')).getByRole('button', { name: 'Details of Weather' }));
    const dialog = within(await screen.findByRole('dialog'));
    const tabs = within(await dialog.findByRole('tablist', { name: 'Platform' }));
    // Node by default, marked as this server's, with the note that this is what it installs
    expect(tabs.getByRole('tab', { name: 'Node · this server' }).getAttribute('aria-selected')).toBe('true');
    expect(dialog.getByTestId('platform-note').textContent).toBe('This server runs Node: this is the package it installs.');
    expect(dialog.getByTestId('platform-package').textContent).toBe('@qodalis/cli-server-plugin-weather');
    expect(dialog.getByText('v1.1.0')).toBeTruthy();
    expect(dialog.getByText('v1.0.0')).toBeTruthy();
    expect(dialog.queryByText('v1.0.0b31')).toBeNull();
    expect(dialog.getByText('npm install @qodalis/cli-server-plugin-weather')).toBeTruthy();
    expect(dialog.queryByText('pip install qodalis-cli-server-plugin-weather')).toBeNull();
    // Node has no readme of its own: the plugin's
    expect(dialog.getByText('Readme (Node)')).toBeTruthy();
    expect(dialog.getByTestId('readme').textContent).toContain('Current weather and forecasts');

    // Python: its versions, command and own readme
    fireEvent.click(tabs.getByRole('tab', { name: 'Python' }));
    expect(tabs.getByRole('tab', { name: 'Python' }).getAttribute('aria-selected')).toBe('true');
    expect(dialog.getByTestId('platform-note').textContent).toBe('This server runs Node: shown for reference, it installs the Node package.');
    expect(dialog.getByText('v1.0.0b31')).toBeTruthy();
    expect(dialog.queryByText('v1.1.0')).toBeNull();
    expect(dialog.getByText('pip install qodalis-cli-server-plugin-weather')).toBeTruthy();
    expect(dialog.getByTestId('readme').textContent).toBe('# Weather for Python\n\npip it.');

    // .NET: the latest from the package when no version is listed; copy its command
    fireEvent.click(tabs.getByRole('tab', { name: '.NET' }));
    expect(dialog.getByText('v1.0.0-beta.31')).toBeTruthy();
    fireEvent.click(dialog.getByRole('button', { name: 'Copy the .NET install command' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('dotnet add package Qodalis.Cli.Plugin.Weather'));
    expect(await dialog.findByText('Copied')).toBeTruthy();

    expect(dialog.getByText('units')).toBeTruthy();
    expect(dialog.getByText('one of metric, imperial')).toBeTruthy();
  });

  it('marks the platforms the plugin has no package for, and defaults to the first it has when not this server’s', async () => {
    server.items = [PYONLY];
    server.details = () => json({ ...PYONLY, readme: '', versions: [] });
    renderPage('/plugins?tab=marketplace&kind=server&platform=all');
    fireEvent.click((await findCard('Py only')).getByRole('button', { name: 'Details of Py only' }));
    const dialog = within(await screen.findByRole('dialog'));
    const tabs = within(await dialog.findByRole('tablist', { name: 'Platform' }));
    const node = tabs.getByRole('tab', { name: 'Node: not available' }) as HTMLButtonElement;
    expect(node.disabled).toBe(true);
    expect((tabs.getByRole('tab', { name: '.NET: not available' }) as HTMLButtonElement).disabled).toBe(true);
    expect(tabs.getByRole('tab', { name: 'Python' }).getAttribute('aria-selected')).toBe('true');
    expect(dialog.getByTestId('platform-note').textContent).toBe('This plugin has no package for Node.');
    expect(dialog.getByText('pip install qodalis-cli-server-plugin-pyonly')).toBeTruthy();
    // No readme at all: the description
    expect(dialog.getByTestId('readme').textContent).toBe('Python only');
  });

  it('shows the setup note of a plugin that needs setup in code', async () => {
    server.details = () => json({ ...PORTAL, description: '', readme: '', versions: [] });
    renderPage();
    fireEvent.click((await findCard('Portal')).getByRole('button', { name: 'Details of Portal' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByTestId('setup-note')).toBeTruthy();
    // no readme anywhere and no description
    expect(await dialog.findByText('No readme.')).toBeTruthy();
  });

  it('shows a failure to load the details', async () => {
    server.details = () => json({ error: 'marketplace unreachable' }, 502);
    renderPage();
    fireEvent.click((await findCard('Weather')).getByRole('button', { name: 'Details of Weather' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(await dialog.findByText('Could not load the details')).toBeTruthy();
  });
});

describe('Installed tab: server plugins from the marketplace', () => {
  beforeEach(() => {
    server.installed = INSTALLED;
    server.hostPackages = [
      { id: '@qodalis/cli-server-node', name: 'Core', version: '1.0.0-beta.31' },
      { id: '@qodalis/cli-server-plugin-jobs', name: 'Jobs', version: '1.0.0' },
    ];
  });

  it('lists them with a Marketplace badge and their load status, once', async () => {
    renderPage('/plugins');
    const jobs = await findCard('Jobs');
    expect(jobs.getByText('Marketplace')).toBeTruthy();
    expect(within(jobs.getByTestId('load-status')).getByText('Loaded')).toBeTruthy();
    expect(within(card('Weather').getByTestId('load-status')).getByText('Runs after a restart')).toBeTruthy();
    expect(card('Weather').getByText('Running v1.0.0')).toBeTruthy();
    expect(within(card('Gone').getByTestId('load-status')).getByText('Removed: runs until a restart')).toBeTruthy();
    // The host's package list leaves out the marketplace's
    expect(await screen.findByText('Core')).toBeTruthy();
    expect(screen.getAllByText('Jobs')).toHaveLength(1);
  });

  it('shows a failed load with its error', async () => {
    renderPage('/plugins');
    const broken = await findCard('Broken');
    expect(within(broken.getByTestId('load-status')).getByText('Failed to load')).toBeTruthy();
    const alert = broken.getByRole('alert');
    expect(within(alert).getByText('Load error')).toBeTruthy();
    expect(within(alert).getByText('Cannot find module ./plugin.js')).toBeTruthy();
  });

  it('shows Needs configuration with Configure opening its settings', async () => {
    renderPage('/plugins');
    const mailer = await findCard('Mailer');
    expect(within(mailer.getByTestId('load-status')).getByText('Needs configuration')).toBeTruthy();
    expect(mailer.getByText('Missing: smtp.host, smtp.password')).toBeTruthy();
    const configure = mailer.getByRole('link', { name: 'Configure Mailer' });
    expect(configure.getAttribute('href')).toBe('/config?provider=mailer-plugin');
    fireEvent.click(configure);
    expect(location()).toBe('/config?provider=mailer-plugin');
  });

  it('offers Update and Remove with plugins:install, none for a removed plugin', async () => {
    renderPage('/plugins');
    await sessionLoaded();
    const jobs = await findCard('Jobs');
    expect(await jobs.findByRole('button', { name: 'Update' })).toBeTruthy();
    expect(jobs.getByRole('button', { name: 'Remove' })).toBeTruthy();
    expect(card('Weather').queryByRole('button', { name: 'Update' })).toBeNull();
    expect(card('Gone').queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('hides them without plugins:install', async () => {
    server.permissions = ['admin:access'];
    renderPage('/plugins');
    await sessionLoaded();
    const jobs = await findCard('Jobs');
    await waitFor(() => expect(jobs.queryByRole('button', { name: 'Remove' })).toBeNull());
    expect(jobs.queryByRole('button', { name: 'Update' })).toBeNull();
  });

  it('removes after asking, then says to restart', async () => {
    server.action = () => json({ ...INSTALLED[0], status: 'removed', restartRequired: true }, 202);
    renderPage('/plugins');
    await confirmAction('Jobs', 'Remove');
    const notice = await screen.findByTestId('restart-notice');
    expect(within(notice).getByText('Jobs removed.')).toBeTruthy();
    expect(requests('DELETE', `${API}/installed/jobs`)).toHaveLength(1);
  });

  it('shows needs-configuration with Configure for a plugin added in code', async () => {
    server.hostPackages = [
      { id: '@qodalis/cli-server-node', name: 'Core', version: '1.0.0-beta.31' },
      { id: '@qodalis/cli-server-plugin-users-postgres', name: 'Users Postgres', version: '1.0.0', source: 'code', status: 'needs-configuration', missing: ['settings.connectionString'], settings: 'users-postgres' },
    ];
    renderPage('/plugins');
    const pg = await findCard('Users Postgres');
    const note = pg.getByTestId('needs-configuration');
    expect(within(note).getByText('Needs configuration')).toBeTruthy();
    expect(within(note).getByText('Missing: settings.connectionString')).toBeTruthy();
    expect(within(note).getByRole('link', { name: 'Configure Users Postgres' }).getAttribute('href')).toBe('/config?provider=users-postgres');
    // The card still opens the details page
    expect(pg.getAllByRole('link').map(l => l.getAttribute('href'))).toContain('/plugins/%40qodalis%2Fcli-server-plugin-users-postgres');
    // A plugin without the status shows none
    expect(within(screen.getByRole('article', { name: 'Core' })).queryByTestId('needs-configuration')).toBeNull();
  });

  it('lists a package marked source marketplace once, in the marketplace section', async () => {
    server.hostPackages = [
      { id: '@qodalis/cli-server-node', name: 'Core', version: '1.0.0-beta.31' },
      { id: '@qodalis/cli-server-plugin-other', name: 'Other', version: '1.0.0', source: 'marketplace' },
    ];
    renderPage('/plugins');
    expect(await screen.findByText('Core')).toBeTruthy();
    expect(screen.queryByText('Other')).toBeNull();
  });

  it('shows no section on a server without the server marketplace', async () => {
    server.installed = [];
    renderPage('/plugins');
    expect(await screen.findByText('Core')).toBeTruthy();
    expect(screen.queryByText('Server plugins from the marketplace')).toBeNull();
  });
});

describe('Server marketplace API helpers', () => {
  it('finds this server’s platform from GET /, else from the plugin’s own package', () => {
    const item = readServerPluginItem(WEATHER);
    expect(ownPlatform({ marketplaceUrl: '', install: 'verified', platform: 'dotnet', serverVersion: null, enabled: true }, item)).toBe('dotnet');
    expect(ownPlatform({ marketplaceUrl: '', install: 'verified', platform: null, serverVersion: null, enabled: true }, item)).toBe('node');
    const python = readServerPluginItem({ ...WEATHER, platform: { ...WEATHER.platform, package: 'qodalis-cli-server-plugin-weather' } });
    expect(ownPlatform(null, python)).toBe('python');
    expect(ownPlatform(null, readServerPluginItem(PYONLY))).toBeNull();
  });

  it('links an installed plugin’s settings', () => {
    expect(serverPluginSettingsPath({ name: 'weather' })).toBe('/config?provider=weather');
    expect(serverPluginSettingsPath({ name: 'mailer', settings: 'mail' })).toBe('/config?provider=mail');
  });
});

describe('Server plugin translations', () => {
  it('has every text in every language with the same placeholders', () => {
    const keys = Object.keys(serverMessages.en).sort();
    for (const { code } of LOCALES) {
      const messages = (serverMessages as Record<string, Record<string, string> | undefined>)[code];
      expect(Object.keys(messages ?? {}).sort(), code).toEqual(keys);
      for (const key of keys) {
        const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
        expect(placeholders(messages![key]), `${code}.${key}`).toEqual(placeholders(serverMessages.en[key as keyof typeof serverMessages.en]));
      }
    }
  });

  it('shows the switch and cards in German', async () => {
    localStorage.setItem('qcli_admin_locale', 'de');
    renderPage('/plugins?tab=marketplace&kind=server&platform=all');
    expect(screen.getByRole('button', { name: 'Server-Plugins' })).toBeTruthy();
    expect(await (await findCard('Py only')).findByText('Nicht verfügbar für Node')).toBeTruthy();
  });
});

describe('Server plugins: the server\'s failure is shown', () => {
  const EACCES = 'cannot write the plugins folder /app/server/qcli-data/server-plugins: permission denied (EACCES). Set dataDir (or QCLI_DATA_DIR) to a writable folder';
  let scrolled: Element[];
  beforeEach(() => {
    scrolled = [];
    // jsdom has no layout: record what is brought into view
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this); };
  });
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('install, 500 with { error }: the server\'s message, brought into view', async () => {
    server.action = () => json({ error: EACCES }, 500);
    renderPage();
    await confirmAction('Weather', 'Install');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(`Could not install Weather${EACCES}`);
    expect(scrolled.some(el => el.contains(alert))).toBe(true);
  });

  it('install, 500 without a body: "The server answered 500" and the status text', async () => {
    server.action = () => new Response(null, { status: 500, statusText: 'Internal Server Error' });
    renderPage();
    await confirmAction('Weather', 'Install');
    expect((await screen.findByRole('alert')).textContent).toContain('The server answered 500 Internal Server Error');
  });

  it('update and remove from the Installed tab', async () => {
    server.installed = INSTALLED;
    server.action = (method) => (method === 'PUT' ? json({ error: EACCES }, 500) : new Response(null, { status: 500 }));
    renderPage('/plugins');
    await confirmAction('Jobs', 'Update');
    let failure = await screen.findByTestId('action-failure');
    expect(within(failure).getByRole('alert').textContent).toBe(`Could not update Jobs${EACCES}`);
    await confirmAction('Jobs', 'Remove');
    await waitFor(() => expect(screen.getByTestId('action-failure').textContent).toContain('Could not remove Jobs'));
    failure = screen.getByTestId('action-failure');
    expect(failure.textContent).toContain('The server answered 500 Internal Server Error');
    const alert = within(failure).getByRole('alert');
    expect(scrolled.some(el => el.contains(alert))).toBe(true);
  });
});
