// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import App from '../App';
import { I18nProvider } from '../i18n';
import { setToken } from '../api/client';
import { FakeWebSocket, installFakeServer, type FakeServer } from '../test/fakes';
import { loadExtension } from '../pages/extension/loadExtension';

vi.mock('../pages/terminal/TerminalPage', () => ({ default: () => <div>embedded terminal</div> }));
vi.mock('../pages/extension/loadExtension', async original => ({
  ...(await original<typeof import('../pages/extension/loadExtension')>()),
  loadExtension: vi.fn(),
}));

const EXTENSIONS = '/api/v1/qcli/dashboard/extensions';
const JOBS = { id: 'jobs', title: 'Jobs', icon: '⏱', group: 'operations', order: 10, entry: '/qcli/modules/jobs/extension.js' };
const KANBAN = {
  id: 'kanban', title: 'Kanban', icon: '🗂️', group: 'operations', order: 20, entry: '/qcli/modules/kanban/extension.js', source: 'marketplace',
};

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

let server: FakeServer;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  FakeWebSocket.install();
  server = installFakeServer({ routes: { [EXTENSIONS]: { extensions: [JOBS] } } });
  setToken('good-token');
  vi.mocked(loadExtension).mockReset();
  vi.mocked(loadExtension).mockResolvedValue({ mount: (el: HTMLElement) => { el.textContent = 'kanban board'; } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The events socket, open. */
async function openSocket(): Promise<FakeWebSocket> {
  await waitFor(() => expect(FakeWebSocket.live).toHaveLength(1));
  const socket = FakeWebSocket.live[0];
  act(() => socket.open());
  return socket;
}

const extensionLoads = () => server.requests.filter(p => p === EXTENSIONS).length;

describe('live refresh of the extensions (dashboard:extensions-changed)', () => {
  it('adds a newly installed page to the sidebar without a reload', async () => {
    renderApp('/');
    const nav = within(await screen.findByRole('navigation'));
    await nav.findByRole('link', { name: /Jobs/ });
    expect(nav.queryByRole('link', { name: /Kanban/ })).toBeNull();
    const socket = await openSocket();

    server.routes[EXTENSIONS] = { extensions: [JOBS, KANBAN] };
    act(() => socket.emit({ type: 'dashboard:extensions-changed' }));

    const link = await nav.findByRole('link', { name: /Kanban/ });
    expect(link.getAttribute('href')).toBe('/x/kanban');
    expect(extensionLoads()).toBe(2);
  });

  it('drops a removed page from the sidebar', async () => {
    server.routes[EXTENSIONS] = { extensions: [JOBS, KANBAN] };
    renderApp('/');
    const nav = within(await screen.findByRole('navigation'));
    await nav.findByRole('link', { name: /Kanban/ });
    const socket = await openSocket();

    server.routes[EXTENSIONS] = { extensions: [JOBS] };
    act(() => socket.emit({ type: 'dashboard:extensions-changed' }));

    await waitFor(() => expect(nav.queryByRole('link', { name: /Kanban/ })).toBeNull());
    expect(nav.getByRole('link', { name: /Jobs/ })).toBeTruthy();
    // The page the user is on stays
    expect(screen.getByTestId('location').textContent).toBe('/');
  });

  it('leaves a removed page that is open for Plugins, which says so', async () => {
    server.routes[EXTENSIONS] = { extensions: [JOBS, KANBAN] };
    renderApp('/x/kanban');
    expect(await screen.findByText('kanban board')).toBeTruthy();
    const socket = await openSocket();

    server.routes[EXTENSIONS] = { extensions: [JOBS] };
    act(() => socket.emit({ type: 'dashboard:extensions-changed' }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/plugins'));
    expect(await screen.findByText('The page Kanban was removed from the dashboard.')).toBeTruthy();
    expect(screen.queryByText('This page is not available')).toBeNull();
  });

  it('keeps an open page that is still there after a change', async () => {
    server.routes[EXTENSIONS] = { extensions: [JOBS, KANBAN] };
    renderApp('/x/kanban');
    expect(await screen.findByText('kanban board')).toBeTruthy();
    const socket = await openSocket();

    server.routes[EXTENSIONS] = { extensions: [{ ...KANBAN, version: '2.0.0' }, JOBS] };
    act(() => socket.emit({ type: 'dashboard:extensions-changed' }));

    await waitFor(() => expect(extensionLoads()).toBe(2));
    expect(screen.getByTestId('location').textContent).toBe('/x/kanban');
  });

  it('keeps the pages when the reload fails', async () => {
    server.routes[EXTENSIONS] = { extensions: [JOBS, KANBAN] };
    renderApp('/');
    const nav = within(await screen.findByRole('navigation'));
    await nav.findByRole('link', { name: /Kanban/ });
    const socket = await openSocket();

    vi.mocked(fetch).mockImplementationOnce(async () => new Response('boom', { status: 500 }));
    act(() => socket.emit({ type: 'dashboard:extensions-changed' }));

    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([u]) => String(u) === EXTENSIONS)).toHaveLength(2));
    expect(nav.getByRole('link', { name: /Kanban/ })).toBeTruthy();
  });

  it('ignores other events', async () => {
    renderApp('/');
    const nav = within(await screen.findByRole('navigation'));
    await nav.findByRole('link', { name: /Jobs/ });
    const socket = await openSocket();

    server.routes[EXTENSIONS] = { extensions: [JOBS, KANBAN] };
    act(() => socket.emit({ type: 'config:changed' }));
    await new Promise(r => setTimeout(r, 20));
    expect(extensionLoads()).toBe(1);
    expect(nav.queryByRole('link', { name: /Kanban/ })).toBeNull();
  });
});
