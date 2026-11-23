// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { DashboardExtension, DashboardExtensionContext } from '@qodalis/cli-server-dashboard-kit';
import ExtensionPage from './ExtensionPage';
import { loadExtension } from './loadExtension';
import { AuthProvider } from '../../context/AuthContext';
import { ExtensionsProvider } from '../../context/ExtensionsContext';
import { I18nProvider } from '../../i18n';
import { navigation, setToken } from '../../api/client';

vi.mock('./loadExtension', async original => ({
  ...(await original<typeof import('./loadExtension')>()),
  loadExtension: vi.fn(),
}));

const MARKETPLACE = {
  id: 'marketplace',
  title: 'Marketplace',
  titles: { de: 'Marktplatz' },
  permission: 'marketplace:moderate',
  entry: '/qcli/marketplace/admin/extension.js',
  styles: ['/qcli/marketplace/admin/extension.css'],
  version: '0.1.0',
};
const OPEN = { id: 'hello', title: 'Hello', entry: '/hello.js' };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let session: Response | (() => Response);
let extensions: unknown;
const requests: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  setToken('tok');
  requests.length = 0;
  document.head.querySelectorAll('link[data-qcli-extension-style]').forEach(l => l.remove());
  extensions = { extensions: [MARKETPLACE, OPEN] };
  session = () => json({ user: { id: 'u1', name: 'root', email: 'root@example.com' }, permissions: ['marketplace:*'] });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.endsWith('/auth/mode')) return json({ mode: 'password' });
    if (url.endsWith('/auth/me')) return json({ username: 'root', authenticatedAt: '' });
    if (url.endsWith('/dashboard/extensions')) return json(extensions);
    if (url.endsWith('/sessions/current')) return typeof session === 'function' ? session() : session;
    if (url.endsWith('/api/v1/qcli/marketplace/stats')) return json({ plugins: 42 });
    if (url.endsWith('/expired')) return json({ error: 'Unauthorized' }, 401);
    return json({ error: 'not found' }, 404);
  }));
  vi.mocked(loadExtension).mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const where = { path: '' };
function LocationProbe() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    where.path = `${pathname}${search}`;
  }, [pathname, search]);
  return null;
}

function renderPage(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ExtensionsProvider>
            <Routes>
              <Route path="/x/:id/*" element={<ExtensionPage />} />
              <Route path="*" element={<div>elsewhere</div>} />
            </Routes>
            <LocationProbe />
          </ExtensionsProvider>
        </AuthProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

/** An extension recording its mount, context and cleanup. */
function fakeExtension() {
  const calls = { contexts: [] as DashboardExtensionContext[], cleanups: 0, paths: [] as string[], themes: [] as string[] };
  const extension: DashboardExtension = {
    mount(element, context) {
      calls.contexts.push(context);
      element.innerHTML = `<p>mounted ${context.extension.id} for ${context.user.name}</p>`;
      const offPath = context.onPathChange(path => calls.paths.push(path));
      const offTheme = context.onThemeChange(theme => calls.themes.push(theme));
      return () => {
        offPath();
        offTheme();
        calls.cleanups++;
      };
    },
  };
  return { extension, calls };
}

describe('ExtensionPage', () => {
  it('injects the styles once, mounts the module with the context, and cleans up when left', async () => {
    const { extension, calls } = fakeExtension();
    vi.mocked(loadExtension).mockResolvedValue(extension);
    const view = renderPage('/x/marketplace/plugins/abc?tab=log');

    expect(await screen.findByText('mounted marketplace for root')).toBeTruthy();
    expect(loadExtension).toHaveBeenCalledWith(MARKETPLACE.entry, 0);
    const links = document.head.querySelectorAll('link[data-qcli-extension-style]');
    expect([...links].map(l => l.getAttribute('href'))).toEqual([MARKETPLACE.styles[0]]);

    const context = calls.contexts[0];
    expect(context.extension).toEqual(MARKETPLACE);
    expect(context.user).toEqual({ id: 'u1', name: 'root', email: 'root@example.com' });
    expect(context.permissions).toEqual(['marketplace:*']);
    expect(context.hasPermission('marketplace:moderate')).toBe(true);
    expect(context.hasPermission('users:read')).toBe(false);
    expect(context.path).toBe('/plugins/abc?tab=log');
    expect(context.language).toBe('en');
    expect(context.apiBase).toBe(window.location.origin);
    expect(context.apiVersion).toBe(1);
    expect(typeof context.dashboardVersion).toBe('string');

    // Its own routing below /x/<id>
    act(() => context.navigate('/log'));
    expect(where.path).toBe('/x/marketplace/log');
    await waitFor(() => expect(calls.paths).toEqual(['/log']));
    expect(context.path).toBe('/log');

    // The theme follows the page
    act(() => { document.documentElement.dataset.qcliTheme = 'light'; });
    await waitFor(() => expect(calls.themes).toEqual(['light']));
    expect(context.theme).toBe('light');

    view.unmount();
    expect(calls.cleanups).toBe(1);
  });

  it('fetch sends the dashboard token and JSON headers; a 401 signs the user out', async () => {
    const { extension, calls } = fakeExtension();
    vi.mocked(loadExtension).mockResolvedValue(extension);
    const toSignIn = vi.spyOn(navigation, 'toSignIn').mockImplementation(() => {});
    renderPage('/x/marketplace');
    await screen.findByText('mounted marketplace for root');
    const context = calls.contexts[0];

    const res = await context.fetch('/api/v1/qcli/marketplace/stats', { method: 'POST', body: '{}' });
    expect(await res.json()).toEqual({ plugins: 42 });
    const sent = requests.find(r => r.url.endsWith('/marketplace/stats'))!;
    expect(sent.url).toBe(`${window.location.origin}/api/v1/qcli/marketplace/stats`);
    const headers = new Headers(sent.init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer tok');
    expect(headers.get('Content-Type')).toBe('application/json');

    // No token for other origins
    await context.fetch('https://elsewhere.example.com/x');
    expect(new Headers(requests.at(-1)!.init?.headers).get('Authorization')).toBeNull();

    expect((await context.fetch('/expired')).status).toBe(401);
    expect(toSignIn).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('qcli_admin_token')).toBeNull();
  });

  it('shows the error panel with the version when loading fails, and Retry loads a fresh copy', async () => {
    const { extension } = fakeExtension();
    vi.mocked(loadExtension).mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module')).mockResolvedValue(extension);
    renderPage('/x/marketplace');

    expect(await screen.findByText('Marketplace could not be loaded')).toBeTruthy();
    expect(screen.getByText('Failed to fetch dynamically imported module')).toBeTruthy();
    expect(screen.getByText('Version 0.1.0')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('mounted marketplace for root')).toBeTruthy();
    expect(loadExtension).toHaveBeenLastCalledWith(MARKETPLACE.entry, 1);
    expect(screen.queryByText('Marketplace could not be loaded')).toBeNull();
  });

  it('shows the error panel when mount throws', async () => {
    vi.mocked(loadExtension).mockResolvedValue({ mount: () => { throw new Error('boom'); } });
    renderPage('/x/hello');
    expect(await screen.findByText('Hello could not be loaded')).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
  });

  it('hides an extension whose permission the user lacks', async () => {
    session = () => json({ user: { id: 'u2', name: 'viewer' }, permissions: ['commands:read'] });
    renderPage('/x/marketplace');
    expect(await screen.findByText('This page is not available')).toBeTruthy();
    expect(loadExtension).not.toHaveBeenCalled();
  });

  it('on a server without sessions (one admin account), the user holds every permission', async () => {
    session = () => json({ error: 'not found' }, 404);
    const { extension, calls } = fakeExtension();
    vi.mocked(loadExtension).mockResolvedValue(extension);
    renderPage('/x/marketplace');
    expect(await screen.findByText(/mounted marketplace/)).toBeTruthy();
    expect(calls.contexts[0].permissions).toEqual(['*']);
    // The dashboard account's name (read live: here the sign-in check finishes after the mount)
    await waitFor(() => expect(calls.contexts[0].user).toEqual({ id: 'root', name: 'root' }));
  });

  it('a session that cannot be read holds no permission: only extensions without one show', async () => {
    session = () => json({ error: 'boom' }, 500);
    renderPage('/x/marketplace');
    expect(await screen.findByText('This page is not available')).toBeTruthy();
    expect(loadExtension).not.toHaveBeenCalled();

    cleanup();
    const { extension } = fakeExtension();
    vi.mocked(loadExtension).mockResolvedValue(extension);
    renderPage('/x/hello');
    expect(await screen.findByText(/mounted hello/)).toBeTruthy();
  });

  it('a server without the endpoint has no extensions', async () => {
    extensions = undefined;
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/mode')) return json({ mode: 'password' });
      if (url.endsWith('/auth/me')) return json({ username: 'root', authenticatedAt: '' });
      return json({ error: 'not found' }, 404);
    });
    renderPage('/x/hello');
    expect(await screen.findByText('This page is not available')).toBeTruthy();
  });
});
