// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import PluginsPage from './PluginsPage';
import { AuthProvider } from '../../context/AuthContext';
import { ExtensionsProvider } from '../../context/ExtensionsContext';
import { WebSocketProvider } from '../../context/WebSocketContext';
import { RestartProvider } from '../../context/RestartContext';
import { I18nProvider } from '../../i18n';
import { setToken } from '../../api/client';
import { FakeWebSocket, json } from '../../test/fakes';

const NOW = new Date().toISOString();
const item = (over: Record<string, unknown>) => ({
  kind: 'server', name: 'weather', package: '@qodalis/cli-server-plugin-weather', title: 'Weather', icon: '🌤️',
  current: '1.0.0', latest: '1.2.0', source: 'marketplace', updateAvailable: true, canUpdate: true, install: {}, ...over,
});
const SERVER = {
  kind: 'core', name: '@qodalis/cli-server-node', package: '@qodalis/cli-server-node', title: 'Server', current: '1.0.0-beta.33',
  latest: '1.0.0-beta.40', source: 'npm', updateAvailable: true, canUpdate: false, install: { node: 'npm install @qodalis/cli-server-node@1.0.0-beta.40' },
};
const full = () => ({
  checkedAt: NOW,
  checking: false,
  server: SERVER,
  dashboardPlugins: [item({ kind: 'dashboard', name: '@acme/cli-dashboard-tickets', package: '@acme/cli-dashboard-tickets', title: 'Tickets', current: '1.0.0', latest: '1.1.0' })],
  serverPlugins: [item({}), item({ name: 'shady', title: 'Shady', canUpdate: false, reason: 'unverified publisher' })],
  codePlugins: [item({
    name: 'jobs', package: '@qodalis/cli-server-plugin-jobs', title: 'Jobs', source: 'code', canUpdate: false, reason: 'update in code', current: '1.0.0-beta.30', latest: '1.0.0-beta.33',
    install: { node: 'npm install @qodalis/cli-server-plugin-jobs@1.0.0-beta.33', python: 'pip install --upgrade qodalis-cli-server-plugin-jobs==1.0.0b33' },
  })],
  count: 5,
});

let updates: Record<string, unknown> | number;
let checked: Record<string, unknown>;
let permissions: string[];
let requests: Array<{ method: string; url: string; body?: string }>;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  setToken('tok');
  FakeWebSocket.install();
  updates = full();
  checked = { ...full(), checkedAt: new Date(Date.now() + 1000).toISOString() };
  permissions = ['*'];
  requests = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.split('?')[0];
    const method = init?.method ?? 'GET';
    requests.push({ method, url, body: typeof init?.body === 'string' ? init.body : undefined });
    switch (path) {
      case '/api/v1/qcli/auth/mode': return json({ mode: 'password' });
      case '/api/v1/qcli/auth/me': return json({ username: 'root', authenticatedAt: '' });
      case '/api/v1/qcli/dashboard/extensions': return json({ extensions: [] });
      case '/api/v1/qcli/sessions/current': return json({ user: { id: 'u1', name: 'root' }, permissions });
      case '/api/v1/qcli/plugins': return json([]);
      case '/api/v1/qcli/plugins/installed': return json([]);
      case '/api/v1/qcli/updates': return typeof updates === 'number' ? json({ error: 'boom' }, updates) : json(updates);
      case '/api/v1/qcli/updates/check': return json(checked);
      case '/api/v1/qcli/server/marketplace/installed/weather':
        return json({ name: 'weather', package: '@qodalis/cli-server-plugin-weather', version: '1.2.0', status: 'pending', restartRequired: true, changed: true }, 202);
      case '/api/v1/qcli/dashboard/marketplace/installed/%40acme%2Fcli-dashboard-tickets':
        return json({ plugin: { name: '@acme/cli-dashboard-tickets', version: '1.1.0', title: 'Tickets', id: 'tickets' }, changed: true, previousVersion: '1.0.0', configDropped: [] });
      default: return json({ error: 'not found' }, 404);
    }
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Location() {
  const l = useLocation();
  return <div data-testid="location">{l.pathname + l.search}</div>;
}

function renderPage(path = '/plugins?tab=updates') {
  render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <WebSocketProvider>
            <ExtensionsProvider>
              <RestartProvider>
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

describe('Plugins → Updates', () => {
  it('the tab shows the number of updates and opens from the URL', async () => {
    renderPage('/plugins');
    const badge = await screen.findByTestId('updates-tab-badge');
    expect(badge.textContent).toBe('5');
    expect(badge.getAttribute('aria-label')).toBe('5 updates available');
    fireEvent.click(screen.getByRole('tab', { name: /Updates/ }));
    expect(screen.getByTestId('location').textContent).toBe('/plugins?tab=updates');
    expect(await screen.findByTestId('updates-tab')).toBeTruthy();
  });

  it('lists marketplace updates, updates in code with their commands, and the server version', async () => {
    renderPage();
    await screen.findByTestId('updates-tab');
    expect(screen.getByTestId('last-checked').textContent).toMatch(/^Last checked/);
    const cards = screen.getAllByTestId('update-card');
    expect(cards.map(c => c.getAttribute('aria-label'))).toEqual(['Tickets', 'Weather', 'Shady', 'Jobs']);
    expect(within(cards[0]).getByTestId('update-versions').textContent).toBe('1.0.0 → 1.1.0');
    expect(within(cards[0]).getByRole('button', { name: 'Update' })).toBeTruthy();
    expect(within(cards[2]).queryByRole('button', { name: 'Update' })).toBeNull();
    expect(within(cards[2]).getByText('Cannot update here: unverified publisher')).toBeTruthy();
    // in code: a command per platform
    expect(within(cards[3]).getByText('npm install @qodalis/cli-server-plugin-jobs@1.0.0-beta.33')).toBeTruthy();
    expect(within(cards[3]).getByText('pip install --upgrade qodalis-cli-server-plugin-jobs==1.0.0b33')).toBeTruthy();
    expect(within(cards[3]).getByRole('button', { name: 'Copy the Python command' })).toBeTruthy();
    // the server
    const server = screen.getByTestId('server-update');
    expect(server.textContent).toContain('Running 1.0.0-beta.33');
    expect(server.textContent).toContain('Newest 1.0.0-beta.40');
    expect(within(server).getByText('npm install @qodalis/cli-server-node@1.0.0-beta.40')).toBeTruthy();
  });

  it('copies a command', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderPage();
    await screen.findByTestId('updates-tab');
    fireEvent.click(within(screen.getByTestId('server-update')).getByRole('button', { name: 'Copy the Node command' }));
    expect(writeText).toHaveBeenCalledWith('npm install @qodalis/cli-server-node@1.0.0-beta.40');
  });

  it('updates a server plugin with the confirmation and says to restart', async () => {
    renderPage();
    await screen.findByTestId('updates-tab');
    const weather = screen.getAllByTestId('update-card')[1];
    fireEvent.click(within(weather).getByRole('button', { name: 'Update' }));
    const confirm = await screen.findByRole('dialog');
    expect(within(confirm).getByText(/@qodalis\/cli-server-plugin-weather@1.2.0/)).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(requests.some(r => r.method === 'PUT' && r.url === '/api/v1/qcli/server/marketplace/installed/weather')).toBe(true));
    expect(await screen.findByTestId('restart-notice')).toBeTruthy();
  });

  it('Update all asks once, updates every plugin it may, and says to restart', async () => {
    renderPage();
    await screen.findByTestId('updates-tab');
    fireEvent.click(screen.getByRole('button', { name: 'Update all' }));
    const confirm = await screen.findByRole('dialog', { name: 'Update 2 plugins?' });
    expect(confirm.textContent).toContain('Tickets');
    expect(confirm.textContent).toContain('Weather');
    expect(confirm.textContent).not.toContain('Shady');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Update all' }));
    await waitFor(() => expect(screen.getByTestId('restart-notice').textContent).toContain('Updated 2 plugins.'));
    expect(requests.filter(r => r.method === 'PUT').map(r => r.url)).toEqual([
      '/api/v1/qcli/dashboard/marketplace/installed/%40acme%2Fcli-dashboard-tickets',
      '/api/v1/qcli/server/marketplace/installed/weather',
    ]);
  });

  it('without the install permissions: no Update buttons, still the commands', async () => {
    permissions = ['admin:access', 'updates:read'];
    renderPage();
    await screen.findByTestId('updates-tab');
    await waitFor(() => expect(requests.some(r => r.url === '/api/v1/qcli/sessions/current')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Update' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Update all' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check now' })).toBeTruthy();
  });

  it('Check now asks the server and shows the new result', async () => {
    checked = { checkedAt: new Date(Date.now() + 1000).toISOString(), checking: false, server: { ...SERVER, latest: SERVER.current, updateAvailable: false }, dashboardPlugins: [], serverPlugins: [], codePlugins: [], count: 0 };
    renderPage();
    await screen.findByTestId('updates-tab');
    updates = checked;
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    expect(await screen.findByText(/Everything is up to date/)).toBeTruthy();
    expect(requests.some(r => r.method === 'POST' && r.url === '/api/v1/qcli/updates/check')).toBe(true);
    expect(screen.getByTestId('server-update').textContent).toContain('Up to date');
    expect(screen.queryByTestId('updates-tab-badge')).toBeNull();
  });

  it('never checked: says so; a partial failure is shown', async () => {
    updates = { checkedAt: null, checking: false, server: null, dashboardPlugins: [], serverPlugins: [], codePlugins: [], count: 0 };
    renderPage();
    expect(await screen.findByText('No check has run yet')).toBeTruthy();
    expect(screen.getByTestId('last-checked').textContent).toBe('Not checked yet');
    cleanup();
    updates = { ...full(), error: 'dashboard plugins: marketplace unreachable' };
    renderPage();
    expect(await screen.findByText('Part of the check did not answer: dashboard plugins: marketplace unreachable')).toBeTruthy();
  });

  it('a server without updates, and a failed load', async () => {
    updates = 404;
    renderPage();
    expect(await screen.findByText(/does not check for updates/)).toBeTruthy();
    cleanup();
    updates = 500;
    renderPage();
    expect(await screen.findByText('Could not load the updates')).toBeTruthy();
  });
});
