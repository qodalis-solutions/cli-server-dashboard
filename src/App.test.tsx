// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useLocation } from 'react-router';
import App from './App';
import { I18nProvider } from './i18n';
import { getToken, navigation, setToken } from './api/client';
import { consumeFragmentToken } from './api/signIn';
import { FakeWebSocket, installFakeServer, json, stubScreenWidth } from './test/fakes';

// The embedded CLI (xterm.js) needs a real browser; the gate in front of it is what's tested here.
vi.mock('./pages/terminal/TerminalPage', () => ({ default: () => <div>embedded terminal</div> }));

function Location() {
  const { pathname, search } = useLocation();
  return <div data-testid="location" hidden>{`${pathname}${search}`}</div>;
}

function renderApp(path = '/') {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <Location />
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
    expect(await screen.findByPlaceholderText('root')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('shows the password form when /auth/mode fails to load', async () => {
    installFakeServer({ mode: 'network-error' });
    renderApp('/login');
    expect(await screen.findByPlaceholderText('root')).toBeTruthy();
  });

  it('external mode: "Sign in at <signInUrl>" and Retry instead of the password form', async () => {
    installFakeServer({ mode: json({ mode: 'external', signInUrl: 'https://app.example.com/sign-in' }) });
    renderApp('/login');

    const link = await screen.findByRole('link', { name: 'Sign in at https://app.example.com/sign-in' });
    expect(link.getAttribute('href')).toBe(`https://app.example.com/sign-in?returnTo=${encodeURIComponent(`${window.location.origin}/qcli/admin/`)}`);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryByPlaceholderText('root')).toBeNull();
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
    fireEvent.change(await screen.findByPlaceholderText('root'), { target: { value: 'admin' } });
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

describe('navigation on small screens', () => {
  async function renderPhone(path = '/') {
    stubScreenWidth(390);
    installFakeServer();
    setToken('good-token');
    renderApp(path);
    const menu = await screen.findByRole('button', { name: 'Open menu' });
    const drawer = () => screen.getByRole('dialog', { name: 'Navigation' });
    return { menu, drawer };
  }

  it('shows a top bar with the page title where wide screens show the sidebar', async () => {
    const { menu } = await renderPhone('/logs');
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(menu.getAttribute('aria-controls')).toBe('nav-drawer');
    expect(within(screen.getByRole('banner')).getByText('Logs')).toBeTruthy();
    // Closed: hidden from assistive technology, so no dialog or navigation is exposed
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('opens a modal drawer with the pages in sections, locks the page scroll and moves focus into it', async () => {
    const { menu, drawer } = await renderPhone();
    fireEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(drawer().getAttribute('aria-modal')).toBe('true');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toBe(within(drawer()).getByRole('button', { name: 'Close menu' }));
    for (const section of ['General', 'Activity', 'Settings']) expect(within(drawer()).getByRole('heading', { name: section })).toBeTruthy();
    expect(within(drawer()).getByRole('link', { name: /Overview/ }).getAttribute('aria-current')).toBe('page');

    // Tab from the last control wraps to the first
    const select = within(drawer()).getByRole('combobox');
    select.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(within(drawer()).getByRole('button', { name: 'Close menu' }));
  });

  it('closes on navigation, the close button, the backdrop, Escape and a swipe left, giving focus back to the menu button', async () => {
    const { menu, drawer } = await renderPhone();

    fireEvent.click(menu);
    fireEvent.click(within(drawer()).getByRole('link', { name: /Config/ }));
    await screen.findByRole('heading', { level: 2, name: /Config/ });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
    expect(document.body.style.overflow).toBe('');

    fireEvent.click(menu);
    fireEvent.click(within(drawer()).getByRole('button', { name: 'Close menu' }));
    expect(menu.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(menu);
    fireEvent.click(document.querySelector('[data-drawer-backdrop]')!);
    expect(menu.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(menu);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);

    fireEvent.click(menu);
    fireEvent.touchStart(drawer(), { touches: [{ clientX: 250, clientY: 300 }] });
    fireEvent.touchEnd(drawer(), { changedTouches: [{ clientX: 120, clientY: 310 }] });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the sidebar on wide screens, without a menu button', async () => {
    stubScreenWidth(1280);
    installFakeServer();
    setToken('good-token');
    renderApp('/');
    expect(await screen.findByText('alice')).toBeTruthy();
    expect(within(sidebar()).getByRole('link', { name: /Config/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull();
  });
});

describe('events socket', () => {
  it('keeps a single socket across route changes', async () => {
    installFakeServer();
    setToken('good-token');
    renderApp('/');
    expect(await screen.findByText('alice')).toBeTruthy();
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    act(() => FakeWebSocket.instances[0].open());

    for (const name of ['Commands', 'Events', 'Plugins', 'Logs', 'Config', 'Overview', 'Events']) {
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
    await screen.findByPlaceholderText('root');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});

describe('a password that must be changed first', () => {
  function signIn() {
    fireEvent.change(screen.getByPlaceholderText('root'), { target: { value: 'alice' } });
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'temp-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  }

  it('asks for a new password after signing in, sets it, then opens the dashboard', async () => {
    installFakeServer({
      login: () => json({ token: 'good-token', expiresIn: 3600, username: 'alice', mustChangePassword: true }),
      routes: { '/api/v1/qcli/users/alice/password': {} },
    });
    renderApp('/login');
    await screen.findByPlaceholderText('root');
    signIn();

    expect(await screen.findByText('Set a new password')).toBeTruthy();
    // Not signed in yet: the dashboard stays closed
    expect(screen.queryByRole('navigation')).toBeNull();
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'temp-pass-1' } });
    fireEvent.change(screen.getByLabelText('Confirm the new password'), { target: { value: 'temp-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password and continue' }));
    expect(await screen.findByText('Choose a password different from the current one.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'my-own-pass-1' } });
    fireEvent.change(screen.getByLabelText('Confirm the new password'), { target: { value: 'my-own-pass-2' } });
    expect(screen.getByText('The passwords do not match.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Set password and continue' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Confirm the new password'), { target: { value: 'my-own-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password and continue' }));

    expect(await screen.findByRole('navigation')).toBeTruthy();
    const put = vi.mocked(fetch).mock.calls.find(([u]) => String(u).endsWith('/users/alice/password'))!;
    expect(put[1]?.method).toBe('PUT');
    expect(JSON.parse(String(put[1]?.body))).toEqual({ currentPassword: 'temp-pass-1', password: 'my-own-pass-1' });
  });

  it("shows the server's reason when the new password is refused", async () => {
    installFakeServer({ login: () => json({ token: 'good-token', expiresIn: 3600, username: 'alice', mustChangePassword: true }) });
    renderApp('/login');
    await screen.findByPlaceholderText('root');
    signIn();
    await screen.findByText('Set a new password');
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      String(input).endsWith('/users/alice/password') ? json({ error: 'password must be at least 8 characters' }, 400) : original(input, init));
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm the new password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password and continue' }));
    expect(await screen.findByText('The password was not changed: password must be at least 8 characters')).toBeTruthy();
  });
});

describe('account menu', () => {
  const ACCOUNT = { id: 'account', title: 'Account', icon: '👤', group: 'account', order: 0, entry: '/qcli/modules/account/extension.js' };

  it("lists the plugins' account pages above Sign out, not in the sidebar", async () => {
    installFakeServer({ routes: { '/api/v1/qcli/dashboard/extensions': { extensions: [ACCOUNT] } } });
    setToken('good-token');
    renderApp('/');
    const nav = within(await screen.findByRole('navigation'));
    await nav.findByRole('link', { name: /Overview/ });
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).endsWith('/dashboard/extensions'))).toBe(true));
    expect(nav.queryByRole('link', { name: /Account/ })).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'Account menu' })[0]);
    const items = (await screen.findAllByRole('menuitem')).map(i => i.textContent?.trim());
    expect(items).toEqual(['👤Account', 'Sign out']);
    fireEvent.click(screen.getByRole('menuitem', { name: /Account/ }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/x/account'));
  });
});

describe("plugins' pages", () => {
  const JOBS = { id: 'jobs', title: 'Jobs', icon: '⏱', group: 'operations', order: 10, entry: '/qcli/modules/jobs/extension.js' };
  const AUDIT = { id: 'audit', title: 'Audit', icon: '🛡', group: 'operations', order: 30, entry: '/qcli/modules/audit/extension.js' };
  const FILES = { id: 'filesystem', title: 'Filesystem', icon: '📁', group: 'data', order: 10, entry: '/qcli/modules/filesystem/extension.js' };

  it('shows only the pages the server registers, in their sections, and always the Terminal', async () => {
    installFakeServer({ routes: { '/api/v1/qcli/dashboard/extensions': { extensions: [AUDIT, JOBS, FILES] } } });
    setToken('good-token');
    renderApp('/');
    const nav = within(await screen.findByRole('navigation'));
    await nav.findByRole('link', { name: /Jobs/ });
    const links = nav.getAllByRole('link').map(a => a.textContent?.replace(/^\W+/u, '').trim());
    expect(links).toEqual(['Overview', 'Commands', 'Plugins', 'Terminal', 'Jobs', 'Audit', 'Events', 'Logs', 'Filesystem', 'Config']);
  });

  it('has none of them on a server without the plugins', async () => {
    installFakeServer();
    setToken('good-token');
    renderApp('/');
    const nav = within(await screen.findByRole('navigation'));
    await nav.findByRole('link', { name: /Overview/ });
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).endsWith('/dashboard/extensions'))).toBe(true));
    for (const name of ['Jobs', 'Audit', 'Filesystem', 'Data explorer', 'API tokens']) {
      expect(nav.queryByRole('link', { name: new RegExp(name) })).toBeNull();
    }
    expect(nav.getByRole('link', { name: /Terminal/ })).toBeTruthy();
  });

  it.each([
    ['/jobs/fetch-rates?tab=runs', '/x/jobs/fetch-rates?tab=runs'],
    ['/audit?q=root', '/x/audit?q=root'],
    ['/filesystem', '/x/filesystem'],
    ['/data-explorer', '/x/data-explorer'],
    ['/tokens', '/x/tokens'],
  ])('sends the old route %s to the module page %s', async (from, to) => {
    installFakeServer();
    setToken('good-token');
    renderApp(from);
    // No module registered here: the module page says so, under its own address
    expect(await screen.findByText('This page is not available')).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe(to);
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
