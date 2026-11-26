// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import NotificationBell from './NotificationBell';
import NotificationsPage from '../pages/notifications/NotificationsPage';
import { AuthProvider } from '../context/AuthContext';
import { ExtensionsProvider } from '../context/ExtensionsContext';
import { WebSocketProvider } from '../context/WebSocketContext';
import { RestartProvider } from '../context/RestartContext';
import { NotificationsProvider } from '../context/NotificationsContext';
import { I18nProvider } from '../i18n';
import { setToken } from '../api/client';
import { FakeWebSocket, json } from '../test/fakes';

interface Note {
  id: string;
  key: string;
  kind: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  link?: string;
  createdAt: string;
  updatedAt: string;
  read: boolean;
}

const note = (id: string, over: Partial<Note> = {}): Note => ({
  id, key: `k:${id}`, kind: 'update', severity: 'info', title: `Title ${id}`, message: `Message ${id}`,
  createdAt: '2026-11-26T10:00:00Z', updatedAt: '2026-11-26T10:00:00Z', read: false, ...over,
});

let notes: Note[];
let permissions: string[];
let requests: Array<{ method: string; url: string }>;
let available: boolean;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  setToken('tok');
  FakeWebSocket.install();
  available = true;
  permissions = ['*'];
  requests = [];
  notes = [
    note('n1', { severity: 'error', title: 'Plugin broken failed to load', link: '/plugins/%40acme%2Fbroken' }),
    note('n2', { severity: 'warning', title: 'Restart required', read: true }),
    note('n3', { title: 'Update available: Weather 1.2.0', link: '/plugins?tab=updates' }),
  ];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const [path, query = ''] = url.split('?');
    const method = init?.method ?? 'GET';
    requests.push({ method, url });
    const unread = () => notes.filter(n => !n.read).length;
    switch (path) {
      case '/api/v1/qcli/auth/mode': return json({ mode: 'password' });
      case '/api/v1/qcli/auth/me': return json({ username: 'root', authenticatedAt: '' });
      case '/api/v1/qcli/dashboard/extensions': return json({ extensions: [] });
      case '/api/v1/qcli/sessions/current': return json({ user: { id: 'u1', name: 'root' }, permissions });
      case '/api/v1/qcli/notifications': {
        if (!available) return json({ error: 'not found' }, 404);
        const params = new URLSearchParams(query);
        let items = [...notes];
        if (params.get('unread') === 'true') items = items.filter(n => !n.read);
        if (params.get('severity')) items = items.filter(n => n.severity === params.get('severity'));
        if (params.get('limit')) items = items.slice(0, Number(params.get('limit')));
        return json({ items, unreadCount: unread() });
      }
      case '/api/v1/qcli/notifications/read-all':
        notes.forEach(n => (n.read = true));
        return json({ marked: 2, unreadCount: 0 });
      default: {
        const read = /^\/api\/v1\/qcli\/notifications\/([^/]+)\/read$/.exec(path);
        if (read) {
          const n = notes.find(x => x.id === decodeURIComponent(read[1]))!;
          n.read = true;
          return json({ item: n, unreadCount: unread() });
        }
        const one = /^\/api\/v1\/qcli\/notifications\/([^/]+)$/.exec(path);
        if (one && method === 'DELETE') {
          notes = notes.filter(x => x.id !== decodeURIComponent(one[1]));
          return json({ [query.includes('scope=all') ? 'cleared' : 'dismissed']: true, unreadCount: unread() });
        }
        return json({ error: 'not found' }, 404);
      }
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

function renderApp(path = '/') {
  render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <WebSocketProvider>
            <ExtensionsProvider>
              <RestartProvider>
                <NotificationsProvider>
                  <NotificationBell />
                  <Routes>
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="*" element={<div>other page</div>} />
                  </Routes>
                  <Location />
                </NotificationsProvider>
              </RestartProvider>
            </ExtensionsProvider>
          </WebSocketProvider>
        </AuthProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

const bell = () => screen.getByTestId('notification-bell');
const location = () => screen.getByTestId('location').textContent;

describe('NotificationBell', () => {
  it('shows the unread count and the latest notifications; opening one marks it read and follows its link', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId('notification-badge').textContent).toBe('2'));
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 2 unread');
    expect(requests.find(r => r.url.startsWith('/api/v1/qcli/notifications'))?.url).toBe('/api/v1/qcli/notifications?limit=8');

    fireEvent.click(bell());
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    const items = within(panel).getAllByTestId('bell-item');
    expect(items.map(i => i.textContent)).toEqual([
      expect.stringContaining('Plugin broken failed to load'),
      expect.stringContaining('Restart required'),
      expect.stringContaining('Update available: Weather 1.2.0'),
    ]);
    expect(within(items[0]).getByLabelText('Unread')).toBeTruthy();
    expect(within(items[1]).queryByLabelText('Unread')).toBeNull();

    fireEvent.click(items[2]);
    expect(location()).toBe('/plugins?tab=updates');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(requests.some(r => r.method === 'POST' && r.url === '/api/v1/qcli/notifications/n3/read')).toBe(true));
    await waitFor(() => expect(screen.getByTestId('notification-badge').textContent).toBe('1'));
  });

  it('Mark all read clears the badge; View all opens the page', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId('notification-badge')).toBeTruthy());
    fireEvent.click(bell());
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(screen.queryByTestId('notification-badge')).toBeNull());
    expect(bell().getAttribute('aria-label')).toBe('Notifications, none unread');
    fireEvent.click(screen.getByRole('link', { name: 'View all notifications' }));
    expect(location()).toBe('/notifications');
  });

  it("says you're all caught up when there are none", async () => {
    notes = [];
    renderApp();
    await waitFor(() => expect(requests.some(r => r.url.startsWith('/api/v1/qcli/notifications'))).toBe(true));
    fireEvent.click(bell());
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
  });

  it('is hidden on a server without notifications', async () => {
    available = false;
    renderApp();
    await waitFor(() => expect(requests.some(r => r.url.startsWith('/api/v1/qcli/notifications'))).toBe(true));
    await waitFor(() => expect(screen.queryByTestId('notification-bell')).toBeNull());
  });

  it('updates live from notification:changed', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByTestId('notification-badge').textContent).toBe('2'));
    act(() => FakeWebSocket.live.forEach(ws => ws.readyState === FakeWebSocket.CONNECTING && ws.open()));
    notes.unshift(note('n4', { title: 'Server update available: 1.0.0-beta.40' }));
    act(() => FakeWebSocket.live.at(-1)!.emit({ type: 'notification:changed', action: 'created', id: 'n4', unreadCount: 3 }));
    expect(screen.getByTestId('notification-badge').textContent).toBe('3');
    fireEvent.click(bell());
    expect(await screen.findByText('Server update available: 1.0.0-beta.40')).toBeTruthy();
  });

  it('shows 99+ above 99', async () => {
    notes = Array.from({ length: 120 }, (_, i) => note(`x${i}`));
    renderApp();
    await waitFor(() => expect(screen.getByTestId('notification-badge').textContent).toBe('99+'));
  });
});

describe('NotificationsPage', () => {
  it('lists every notification with its severity and actions; the filters go to the server and the URL', async () => {
    renderApp('/notifications');
    const cards = await screen.findAllByTestId('notification-card');
    expect(cards).toHaveLength(3);
    expect(screen.getByText('2 unread')).toBeTruthy();
    expect(within(cards[0]).getByText('Error')).toBeTruthy();
    expect(within(cards[0]).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('/plugins/%40acme%2Fbroken');
    expect(within(cards[1]).queryByRole('button', { name: 'Mark read' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() => expect(screen.getAllByTestId('notification-card')).toHaveLength(2));
    expect(location()).toBe('/notifications?unread=1');
    expect(requests.at(-1)?.url).toContain('unread=true');

    fireEvent.click(screen.getByRole('button', { name: 'Error' }));
    await waitFor(() => expect(screen.getAllByTestId('notification-card')).toHaveLength(1));
    expect(location()).toBe('/notifications?unread=1&severity=error');

    fireEvent.click(screen.getByRole('button', { name: 'Warning' }));
    expect(await screen.findByText('No notifications match these filters.')).toBeTruthy();
  });

  it('marks read, dismisses, and clears for everyone with notifications:manage', async () => {
    renderApp('/notifications');
    let cards = await screen.findAllByTestId('notification-card');
    fireEvent.click(within(cards[0]).getByRole('button', { name: 'Mark read' }));
    await waitFor(() => expect(requests.some(r => r.method === 'POST' && r.url.endsWith('/n1/read'))).toBe(true));
    await waitFor(() => expect(screen.getByText('1 unread')).toBeTruthy());

    cards = screen.getAllByTestId('notification-card');
    fireEvent.click(within(cards[1]).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.getAllByTestId('notification-card')).toHaveLength(2));
    expect(requests.some(r => r.method === 'DELETE' && r.url === '/api/v1/qcli/notifications/n2')).toBe(true);

    cards = screen.getAllByTestId('notification-card');
    fireEvent.click(within(cards[0]).getByRole('button', { name: 'Clear for everyone' }));
    const confirm = await screen.findByRole('dialog', { name: 'Clear this notification for everyone?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Clear for everyone' }));
    await waitFor(() => expect(requests.some(r => r.method === 'DELETE' && r.url === '/api/v1/qcli/notifications/n1?scope=all')).toBe(true));
    await waitFor(() => expect(screen.getAllByTestId('notification-card')).toHaveLength(1));
  });

  it('hides Clear for everyone without notifications:manage', async () => {
    permissions = ['admin:access'];
    renderApp('/notifications');
    const cards = await screen.findAllByTestId('notification-card');
    await waitFor(() => expect(requests.some(r => r.url === '/api/v1/qcli/sessions/current')).toBe(true));
    expect(within(cards[0]).queryByRole('button', { name: 'Clear for everyone' })).toBeNull();
  });

  it('empty and error states', async () => {
    notes = [];
    renderApp('/notifications');
    expect(await screen.findByText("You're all caught up")).toBeTruthy();
    cleanup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input).split('?')[0];
      if (path === '/api/v1/qcli/notifications') return json({ error: 'database down' }, 500);
      if (path === '/api/v1/qcli/auth/mode') return json({ mode: 'password' });
      if (path === '/api/v1/qcli/auth/me') return json({ username: 'root', authenticatedAt: '' });
      return json({ error: 'not found' }, 404);
    }));
    renderApp('/notifications');
    expect(await screen.findByText('Could not load the notifications')).toBeTruthy();
    expect(screen.getByText(/database down/)).toBeTruthy();
  });
});
