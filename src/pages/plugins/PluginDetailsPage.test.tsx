// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import PluginDetailsPage from './PluginDetailsPage';
import { I18nProvider } from '../../i18n';

vi.mock('../../context/ExtensionsContext', () => ({
  useExtensions: () => ({
    extensions: [
      { id: 'weather', title: 'Weather map', titles: { de: 'Wetterkarte' }, icon: '🗺', entry: '/weather.js' },
      { id: 'users', title: 'Users', entry: '/users.js' },
      { id: 'jobs', title: 'Jobs', entry: '/jobs.js' },
    ],
    loading: false,
  }),
}));

const MODULES = [
  { id: 'weather', name: 'Weather', version: '1.2.0', description: 'Weather commands', author: 'Nicolae Lupei', icon: '🌤', enabled: true, processorCount: 2, processors: ['weather', 'forecast'] },
  { id: 'demo', name: 'Demo', version: '1.0.0', description: '', enabled: true, processorCount: 1, processors: ['echo'] },
  { id: 'core', name: 'core', version: '1.0.0', description: '', enabled: true, processorCount: 0, processors: [] },
];

const PACKAGES = [
  { id: '@qodalis/cli-server-node', name: 'Core', version: '1.0.0-beta.31', description: 'The server', icon: '🖥️' },
  { id: '@qodalis/cli-server-plugin-weather', name: 'Weather', version: '1.0.0-beta.31', description: 'Weather plugin package', icon: '🌤️' },
  { id: '@qodalis/cli-server-plugin-users', name: 'Users', version: '1.0.0-beta.31', description: 'Users plugin' },
];

const COMMANDS = [
  {
    command: 'weather', description: 'Shows the weather', module: 'weather', requiredPermissions: ['weather:read'],
    processors: [{ command: 'current', description: '' }, { command: 'now', description: '', requiredPermissions: ['weather:live'] }],
  },
  // A server without command modules: matched by the module's processors
  { command: 'forecast', description: 'The forecast' },
  { command: 'echo', description: 'Echoes', module: 'demo' },
];

const CONFIG = {
  providers: [
    { id: 'weather', title: 'Weather', description: '', order: 1, writable: true, sections: [{ id: 'a' }, { id: 'b' }] },
    { id: 'server', title: 'Server', description: '', order: 0, writable: true, sections: [{ id: 'a' }] },
  ],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;

function stubServer(override?: Handler) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    const answer = override?.(url, init);
    if (answer) return answer;
    if (url.endsWith('/plugins/installed')) return json(PACKAGES);
    if (url.endsWith('/plugins')) return json(MODULES);
    if (url.endsWith('/commands')) return json(COMMANDS);
    if (url.endsWith('/config')) return json(CONFIG);
    return json({ error: 'not found' }, 404);
  }));
  return calls;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  stubServer();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Location() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{pathname + search}</div>;
}

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/plugins/:id" element={<PluginDetailsPage />} />
          <Route path="*" element={null} />
        </Routes>
        <Location />
      </MemoryRouter>
    </I18nProvider>,
  );
}

const location = () => screen.getByTestId('location').textContent;
const section = async (title: string) => (await screen.findByRole('heading', { name: title })).closest('section') as HTMLElement;

describe('PluginDetailsPage of a command module', () => {
  it('shows the header: icon, name, version, author, description and state', async () => {
    renderAt('/plugins/weather');
    const heading = await screen.findByRole('heading', { name: 'Weather', level: 2 });
    const card = heading.closest('div.rounded-xl') as HTMLElement;
    expect(within(card).getByText('v1.2.0')).toBeTruthy();
    expect(within(card).getByText('by Nicolae Lupei')).toBeTruthy();
    expect(within(card).getByText('Weather commands')).toBeTruthy();
    expect(within(card).getByText('Enabled')).toBeTruthy();
    expect(within(card).getByTestId('module-icon').textContent).toBe('🌤');
    expect(within(card).getByRole('switch', { name: 'Disable plugin' }).getAttribute('aria-checked')).toBe('true');
  });

  it("lists the module's commands with sub-commands and permissions, linking to the Commands page", async () => {
    renderAt('/plugins/weather');
    const table = await section('Commands');
    const weather = await within(table).findByRole('link', { name: /^weather$/ });
    expect(weather.getAttribute('href')).toBe('/commands?q=weather');
    expect(within(table).getByRole('link', { name: 'forecast' }).getAttribute('href')).toBe('/commands?q=forecast');
    expect(within(table).queryByText('echo')).toBeNull();
    expect(within(table).getByText('Shows the weather')).toBeTruthy();
    expect(within(table).getByText('current')).toBeTruthy();
    expect(within(table).getByText('now')).toBeTruthy();
    expect(within(table).getByText('Permissions')).toBeTruthy();
    expect(within(table).getByText('weather:read')).toBeTruthy();
    expect(within(table).getByText('weather:live')).toBeTruthy();

    fireEvent.click(weather);
    expect(location()).toBe('/commands?q=weather');
  });

  it('hides the permissions column when no command declares any', async () => {
    stubServer(url => (url.endsWith('/commands') ? json([{ command: 'weather', description: '', module: 'weather' }]) : undefined));
    renderAt('/plugins/weather');
    await within(await section('Commands')).findByRole('link', { name: 'weather' });
    expect(screen.queryByText('Permissions')).toBeNull();
  });

  it('says so when the module registers no commands', async () => {
    renderAt('/plugins/core');
    expect(await screen.findByText('This module registers no commands.')).toBeTruthy();
  });

  it('links its dashboard pages, its configuration and the package that provides it', async () => {
    renderAt('/plugins/weather');
    const page = await screen.findByRole('link', { name: /Weather map/ });
    expect(page.getAttribute('href')).toBe('/x/weather');
    expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();

    const config = await within(await section('Configuration')).findByRole('link');
    expect(config.getAttribute('href')).toBe('/config?provider=weather');
    expect(config.textContent).toContain('2 sections');

    const pkg = within(await section('Package')).getByRole('link');
    expect(pkg.getAttribute('href')).toBe('/plugins/%40qodalis%2Fcli-server-plugin-weather');
    expect(pkg.textContent).toContain('@qodalis/cli-server-plugin-weather');
  });

  it('leaves out the package, pages and configuration when none match', async () => {
    renderAt('/plugins/core');
    await screen.findByRole('heading', { name: 'core', level: 2 });
    await screen.findByText('This module registers no commands.');
    expect(screen.queryByRole('heading', { name: 'Package' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Dashboard pages' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Configuration' })).toBeNull();
  });

  it('has a breadcrumb back to the plugins', async () => {
    renderAt('/plugins/weather');
    const nav = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    const back = within(nav).getByRole('link', { name: 'Plugins' });
    fireEvent.click(back);
    expect(location()).toBe('/plugins');
  });
});

describe('PluginDetailsPage of an installed package', () => {
  it('shows the package and links the modules it provides', async () => {
    renderAt('/plugins/%40qodalis%2Fcli-server-plugin-weather');
    const heading = await screen.findByRole('heading', { name: 'Weather', level: 2 });
    const card = heading.closest('div.rounded-xl') as HTMLElement;
    expect(within(card).getByText('@qodalis/cli-server-plugin-weather')).toBeTruthy();
    expect(within(card).getByText('Weather plugin package')).toBeTruthy();
    expect(within(card).queryByRole('switch')).toBeNull();
    expect(screen.getByText('Installed package')).toBeTruthy();

    const modules = within(await section('Command modules')).getAllByRole('link');
    expect(modules.map(l => l.getAttribute('href'))).toEqual(['/plugins/weather']);
    expect(modules[0].textContent).toContain('2 processors');

    expect(screen.getByRole('link', { name: /Weather map/ }).getAttribute('href')).toBe('/x/weather');
    expect((await within(await section('Configuration')).findByRole('link')).getAttribute('href')).toBe('/config?provider=weather');

    fireEvent.click(modules[0]);
    expect(location()).toBe('/plugins/weather');
    expect(await screen.findByText('by Nicolae Lupei')).toBeTruthy();
  });

  it('shows the pages of a package without command modules, and no modules section', async () => {
    renderAt('/plugins/%40qodalis%2Fcli-server-plugin-users');
    await screen.findByRole('heading', { name: 'Users', level: 2 });
    expect(screen.getByRole('link', { name: 'Users' }).getAttribute('href')).toBe('/x/users');
    expect(screen.queryByRole('heading', { name: 'Command modules' })).toBeNull();
  });
});

describe('PluginDetailsPage loading, errors and not found', () => {
  it('shows a skeleton until the plugins arrive', async () => {
    const answers: Array<() => void> = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => new Promise<Response>(resolve => {
      const url = String(input);
      answers.push(() => resolve(url.endsWith('/plugins/installed') ? json(PACKAGES) : url.endsWith('/plugins') ? json(MODULES)
        : url.endsWith('/commands') ? json(COMMANDS) : json(CONFIG)));
    })));
    renderAt('/plugins/weather');
    expect(screen.getByRole('status').textContent).toContain('Loading plugin…');
    expect(screen.queryByRole('heading', { name: 'Weather', level: 2 })).toBeNull();

    answers.forEach(answer => answer());
    expect(await screen.findByRole('heading', { name: 'Weather', level: 2 })).toBeTruthy();
  });

  it('shows a failure with Retry, and Retry loads the plugin', async () => {
    let fail = true;
    stubServer(url => (fail && url.endsWith('/plugins') ? json({ error: 'modules unavailable' }, 500) : undefined));
    renderAt('/plugins/weather');

    expect((await screen.findByRole('alert')).textContent).toContain('modules unavailable');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Weather', level: 2 })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says "Plugin not found" for an unknown id, with a way back', async () => {
    renderAt('/plugins/nope');
    expect(await screen.findByText('Plugin not found')).toBeTruthy();
    expect(screen.getByText('No command module or installed package has the id nope.')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Back to plugins' }));
    expect(location()).toBe('/plugins');
  });

  it('shows the commands failure in their section only', async () => {
    stubServer(url => (url.endsWith('/commands') ? json({ error: 'commands unavailable' }, 500) : undefined));
    renderAt('/plugins/weather');
    expect((await within(await section('Commands')).findByRole('alert')).textContent).toContain('commands unavailable');
    expect(screen.getByRole('heading', { name: 'Weather', level: 2 })).toBeTruthy();
  });
});

describe('PluginDetailsPage toggle', () => {
  it('disables the module and shows its new state', async () => {
    let enabled = true;
    const calls = stubServer(url => {
      if (url.endsWith('/toggle')) { enabled = !enabled; return json({ id: 'weather', enabled }); }
      if (url.endsWith('/plugins')) return json(MODULES.map(m => (m.id === 'weather' ? { ...m, enabled } : m)));
      return undefined;
    });
    renderAt('/plugins/weather');
    fireEvent.click(await screen.findByRole('switch', { name: 'Disable plugin' }));

    const toggle = await screen.findByRole('switch', { name: 'Enable plugin' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText('Disabled')).toBeTruthy();
    expect(calls).toContain('POST /api/v1/qcli/plugins/weather/toggle');
    expect(location()).toBe('/plugins/weather');
  });

  it('reports a toggle the server refuses', async () => {
    stubServer(url => (url.endsWith('/toggle') ? json({ error: 'core modules cannot be disabled' }, 400) : undefined));
    renderAt('/plugins/weather');
    fireEvent.click(await screen.findByRole('switch', { name: 'Disable plugin' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Could not change Weather: core modules cannot be disabled');
    expect((screen.getByRole('switch', { name: 'Disable plugin' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('PluginDetailsPage long lists', () => {
  const SUBS = ['current', 'now', 'today', 'tomorrow', 'week', 'month'];
  const PERMS = ['weather:read', 'weather:live', 'weather:alerts', 'weather:history', 'weather:admin'];

  it("shows three sub-commands and permissions per command, the others in a dialog", async () => {
    stubServer(url => url.endsWith('/commands')
      ? json([{ command: 'weather', description: 'Shows the weather', module: 'weather', requiredPermissions: PERMS, processors: SUBS.map(command => ({ command, description: '' })) }])
      : undefined);
    renderAt('/plugins/weather');
    const table = await section('Commands');
    const row = (await within(table).findByText('Shows the weather')).closest('tr')!;

    const subs = within(row).getByRole('list', { name: 'Sub-commands' });
    expect(within(subs).getAllByRole('listitem').map(li => li.textContent)).toEqual(['current', 'now', 'today', '+3 more']);
    fireEvent.click(within(subs).getByRole('button', { name: '+3 more' }));
    let dialog = screen.getByRole('dialog', { name: 'Sub-commands of weather' });
    expect(within(dialog).getAllByRole('listitem').map(li => li.textContent)).toEqual(SUBS);
    fireEvent.keyDown(document, { key: 'Escape' });

    const perms = within(row).getByRole('list', { name: 'Permissions' });
    fireEvent.click(within(perms).getByRole('button', { name: '+2 more' }));
    dialog = screen.getByRole('dialog', { name: 'Permissions of weather' });
    expect(within(dialog).getAllByRole('listitem').map(li => li.textContent)).toEqual(PERMS);
  });
});
