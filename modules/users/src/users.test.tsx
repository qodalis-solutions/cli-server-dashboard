// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { LOCALES, type DashboardExtension } from '@qodalis/cli-server-dashboard-kit';
import { fakeDashboard, json, mountExtension, type FakeServer } from '@qodalis/cli-server-dashboard-kit/testing';
import extension from './index';
import { messages } from './messages';
import { matchesUser } from './UsersTab';
import { clientName } from './SessionsTab';
import { canChangePassword, parsePermissions } from './permissions';
import { userStats } from './stats';

const NOW = Date.now();
const user = (id: string, name: string, more: Record<string, unknown> = {}) => ({
  id, name, email: `${name}@example.com`, groups: ['users'], disabled: false, mustChangePassword: false, createdAt: NOW - 86_400_000, updatedAt: NOW, ...more,
});
const USERS = [
  user('1', 'root', { groups: ['admin'], lastLoginAt: NOW - 60_000 }),
  user('2', 'alice', { mustChangePassword: true }),
  user('3', 'bob', { disabled: true }),
];
const GROUPS = [
  { id: 'g1', name: 'admin', description: 'Everything', permissions: ['*'], builtIn: true, createdAt: NOW, updatedAt: NOW },
  { id: 'g2', name: 'users', permissions: ['commands:read'], builtIn: true, createdAt: NOW, updatedAt: NOW },
  { id: 'g3', name: 'ops', permissions: ['jobs:read', 'deploy:run'], builtIn: false, createdAt: NOW, updatedAt: NOW },
];
const CATALOG = [
  { name: 'jobs:read', description: 'See jobs', group: 'Jobs', surface: 'cli' },
  { name: 'jobs:run', description: 'Run jobs', group: 'Jobs', surface: 'cli' },
  { name: 'commands:read', description: 'See commands', group: 'Commands', surface: 'cli' },
];
const SESSIONS = [
  { id: 's1', userId: '1', userName: 'root', createdAt: NOW - 3_600_000, lastActivity: NOW - 1000, expiresAt: NOW + 3_600_000, metadata: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36', remoteAddress: '10.0.0.5' }, current: true },
  { id: 's2', userId: '2', userName: 'alice', createdAt: NOW - 7_200_000, lastActivity: NOW - 60_000, expiresAt: NOW + 3_600_000, metadata: { userAgent: 'curl/8.4.0' } },
];

interface ServerOptions {
  usersReadOnly?: boolean;
  mode?: 'password' | 'external';
}

/** The users plugin's API over the fixtures; records every call. */
function usersServer(calls: string[], options: ServerOptions = {}): FakeServer {
  const users = USERS.map(u => ({ ...u }));
  const groups = GROUPS.map(g => ({ ...g }));
  const sessions = [...SESSIONS];
  return async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${path}${init?.body ? ` ${init.body}` : ''}`);
    if (path === '/api/v1/qcli/auth/mode') return json({ mode: options.mode ?? 'password', signInUrl: null });
    if (path === '/api/v1/qcli/sessions/current') {
      return json({ user: users[0], permissions: ['*'], usersReadOnly: !!options.usersReadOnly, groupsReadOnly: !!options.usersReadOnly });
    }
    if (path.startsWith('/api/v1/qcli/permissions')) return json(path.includes('all=true') ? CATALOG : CATALOG.slice(0, 1));
    if (path === '/api/v1/qcli/users' && method === 'GET') return json(users);
    if (path === '/api/v1/qcli/users' && method === 'POST') {
      const body = JSON.parse(String(init!.body));
      const created = user('9', body.name, { email: body.email, groups: body.groups });
      users.push(created);
      return json(created, 201);
    }
    const userPath = path.match(/^\/api\/v1\/qcli\/users\/([^/]+)(\/password)?$/);
    if (userPath && method === 'PUT' && userPath[2]) {
      const body = JSON.parse(String(init!.body));
      if (body.currentPassword === 'wrong') return json({ error: 'current password is incorrect' }, 403);
      return new Response(null, { status: 204 });
    }
    if (userPath && method === 'PUT') {
      const target = users.find(u => u.id === decodeURIComponent(userPath[1]))!;
      Object.assign(target, JSON.parse(String(init!.body)));
      return json(target);
    }
    if (userPath && method === 'DELETE') {
      users.splice(users.findIndex(u => u.id === decodeURIComponent(userPath[1])), 1);
      return new Response(null, { status: 204 });
    }
    if (path === '/api/v1/qcli/groups' && method === 'GET') return json(groups);
    const groupPath = path.match(/^\/api\/v1\/qcli\/groups\/([^/]+)$/);
    if (groupPath && method === 'PUT') {
      const target = groups.find(g => g.name === decodeURIComponent(groupPath[1]))!;
      Object.assign(target, JSON.parse(String(init!.body)));
      return json(target);
    }
    if (path === '/api/v1/qcli/sessions' && method === 'GET') return json(sessions);
    if (path.startsWith('/api/v1/qcli/sessions/') && method === 'DELETE') {
      sessions.splice(sessions.findIndex(s => path.endsWith(`/${s.id}`)), 1);
      return new Response(null, { status: 204 });
    }
    return json({ error: 'not found' }, 404);
  };
}

let unmount: (() => void) | undefined;
let dashboard: ReturnType<typeof fakeDashboard>;

async function renderPage(id: 'users' | 'account', server: FakeServer, options: { permissions?: string[]; path?: string; language?: string } = {}) {
  dashboard = fakeDashboard(id, { server, ...options });
  unmount = await mountExtension(extension as DashboardExtension, dashboard.context);
}

afterEach(() => {
  unmount?.();
  unmount = undefined;
  cleanup();
});

describe('Users page', () => {
  it('lists users with their state, searches them, and deletes one', async () => {
    const calls: string[] = [];
    await renderPage('users', usersServer(calls));

    expect(await screen.findByText('alice')).toBeTruthy();
    expect(screen.getByText('Must change password')).toBeTruthy();
    expect(screen.getByText('Disabled')).toBeTruthy();
    // fakeDashboard signs in as user 1 (root)
    expect(screen.getByText('You')).toBeTruthy();
    expect(screen.getByText('3 users')).toBeTruthy();
    // Nobody deletes themselves
    expect(screen.queryByRole('button', { name: 'Delete root' })).toBeNull();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ali' } });
    await waitFor(() => expect(dashboard.state.path).toBe('/?q=ali'));

    fireEvent.click(screen.getByRole('button', { name: 'Delete alice' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete user' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(calls).toContain('DELETE /api/v1/qcli/users/2'));
  });

  it('creates a user with a temporary first password', async () => {
    const calls: string[] = [];
    await renderPage('users', usersServer(calls));
    fireEvent.click(await screen.findByRole('button', { name: 'New user' }));

    const dialog = screen.getByRole('dialog', { name: 'New user' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'carol' } });
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'carol@example.com' } });
    fireEvent.click(within(dialog).getByLabelText('ops'));
    fireEvent.change(within(dialog).getByLabelText('Password (optional)'), { target: { value: 'first-pass-1' } });
    expect((within(dialog).getByLabelText('Must change it at the next sign-in') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(calls).toContain('PUT /api/v1/qcli/users/9/password {"password":"first-pass-1","temporary":true}'));
    expect(calls).toContain('POST /api/v1/qcli/users {"name":"carol","email":"carol@example.com","groups":["ops"],"disabled":false}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('sets someone else’s password', async () => {
    const calls: string[] = [];
    await renderPage('users', usersServer(calls));
    fireEvent.click(await screen.findByRole('button', { name: 'Set the password of bob' }));

    const dialog = screen.getByRole('dialog', { name: 'Set the password of bob' });
    fireEvent.change(within(dialog).getByLabelText('New password'), { target: { value: 'reset-pass-1' } });
    fireEvent.change(within(dialog).getByLabelText('Confirm the new password'), { target: { value: 'reset-pass-2' } });
    expect(within(dialog).getByText('The passwords do not match.')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Confirm the new password'), { target: { value: 'reset-pass-1' } });
    fireEvent.click(within(dialog).getByLabelText('Must change it at the next sign-in'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Set password' }));

    await waitFor(() => expect(calls).toContain('PUT /api/v1/qcli/users/3/password {"password":"reset-pass-1","temporary":false}'));
  });

  it('only shows users when the host application manages them', async () => {
    await renderPage('users', usersServer([], { usersReadOnly: true }));
    expect(await screen.findByText(/Users are managed by the host application/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New user' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit alice' })).toBeNull();
  });

  it('without the permissions to change users, only lists them', async () => {
    await renderPage('users', usersServer([]), { permissions: ['users:read'] });
    expect(await screen.findByText('alice')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New user' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit alice' })).toBeNull();
    // No sessions tab without sessions:read
    expect(screen.queryByRole('tab', { name: 'Sessions' })).toBeNull();
  });

  it('edits a group’s permissions: the catalog’s as checkboxes, the others typed', async () => {
    const calls: string[] = [];
    await renderPage('users', usersServer(calls), { path: '/?tab=groups' });

    expect(await screen.findByText('ops')).toBeTruthy();
    expect(screen.getByText('everything')).toBeTruthy();
    // Built-in groups stay
    expect(screen.queryByRole('button', { name: 'Delete admin' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit ops' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit ops' });
    expect((within(dialog).getByLabelText(/^jobs:read/) as HTMLInputElement).checked).toBe(true);
    expect((within(dialog).getByLabelText('Other permissions') as HTMLTextAreaElement).value).toBe('deploy:run');
    fireEvent.click(within(dialog).getByLabelText(/^jobs:run/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls).toContain('PUT /api/v1/qcli/groups/ops {"description":"","permissions":["jobs:read","jobs:run","deploy:run"]}'));
  });

  it('lists sessions and signs one out, not this one', async () => {
    const calls: string[] = [];
    await renderPage('users', usersServer(calls), { path: '/?tab=sessions' });

    expect(await screen.findByText('This session')).toBeTruthy();
    expect(screen.getByText('Chrome · macOS')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign out a session of root' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out a session of alice' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Sign out session' })).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(calls).toContain('DELETE /api/v1/qcli/sessions/s2'));
  });
});

describe('Account page', () => {
  it('shows the profile and what the user can do, and changes the password', async () => {
    const calls: string[] = [];
    await renderPage('account', usersServer(calls));

    expect(await screen.findByText('Profile')).toBeTruthy();
    expect(screen.getByText('You hold every permission (*).')).toBeTruthy();
    expect(await screen.findByText('See jobs')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-pass-123' } });
    fireEvent.change(screen.getByLabelText('Confirm the new password'), { target: { value: 'new-pass-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('current password is incorrect')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-pass-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(dashboard.state.notices).toContainEqual({ message: 'Password changed. Your other sessions were signed out.', kind: 'success' }));
    expect(calls).toContain('PUT /api/v1/qcli/users/1/password {"currentPassword":"old-pass-123","password":"new-pass-123"}');
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('');
  });

  it('saves a new email', async () => {
    const calls: string[] = [];
    await renderPage('account', usersServer(calls));
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'me@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toContain('PUT /api/v1/qcli/users/1 {"email":"me@example.org"}'));
  });

  it('has no password form when the host application signs users in', async () => {
    await renderPage('account', usersServer([], { mode: 'external' }));
    expect(await screen.findByText('You sign in through the host application: change your password there.')).toBeTruthy();
    expect(screen.queryByLabelText('Current password')).toBeNull();
  });

  it('has no password form or email field when the host application manages users', async () => {
    await renderPage('account', usersServer([], { usersReadOnly: true }));
    expect(await screen.findByText('Accounts are managed by the host application: change your password there.')).toBeTruthy();
    expect(screen.queryByLabelText('Current password')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull();
  });

  it('is translated', async () => {
    await renderPage('account', usersServer([]), { language: 'ro' });
    expect(await screen.findByRole('heading', { name: 'Schimbă parola' })).toBeTruthy();
  });
});

describe('helpers', () => {
  it('match users by name, email or group', () => {
    const alice = user('2', 'alice', { groups: ['ops'] });
    expect(matchesUser(alice, 'ALI')).toBe(true);
    expect(matchesUser(alice, 'example.com')).toBe(true);
    expect(matchesUser(alice, 'op')).toBe(true);
    expect(matchesUser(alice, 'bob')).toBe(false);
  });

  it('name clients and parse typed permissions', () => {
    expect(clientName('Mozilla/5.0 (Linux; Android 14) Chrome/131.0 Mobile Safari/537.36')).toBe('Chrome · Android');
    expect(clientName('python-requests/2.31')).toBe('python-requests');
    expect(clientName(undefined)).toBe('');
    expect(parsePermissions(' Jobs:*, deploy:run  jobs:* ')).toEqual(['jobs:*', 'deploy:run']);
  });

  it('allow a password change only with the dashboard’s own sign-in and users kept by the server', () => {
    expect(canChangePassword('password', false)).toBe(true);
    expect(canChangePassword('external', false)).toBe(false);
    expect(canChangePassword('password', true)).toBe(false);
    expect(canChangePassword(undefined, false)).toBe(false);
  });
});

describe('users messages', () => {
  it('translate every English text in the 10 other languages', () => {
    const en = Object.keys(messages.users.en);
    const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '');
    for (const { code } of LOCALES.filter(l => l.code !== 'en')) {
      const own = messages.users[code as Exclude<typeof code, 'en'>] ?? {};
      const missing = en.filter(key => !(key in own) && !(base(key) !== key && `${base(key)}_other` in own));
      expect({ code, missing }).toEqual({ code, missing: [] });
    }
  });
});

describe('users module loading and failures', () => {
  /** The fixtures' server with `answer` first for the paths it answers (a held promise, a failure). */
  function withAnswer(answer: (path: string, method: string) => Response | Promise<Response> | undefined): FakeServer {
    const base = usersServer([]);
    return async (path, init) => (await answer(path, init?.method ?? 'GET')) ?? base(path, init);
  }

  /** A request held until the test answers it. */
  function held() {
    let resolve!: (r: Response) => void;
    const promise = new Promise<Response>(r => { resolve = r; });
    return { promise, resolve };
  }

  for (const [tab, path, fixtures, shown] of [
    ['users', '/api/v1/qcli/users', USERS, 'alice@example.com'],
    ['groups', '/api/v1/qcli/groups', GROUPS, 'Everything'],
    ['sessions', '/api/v1/qcli/sessions', SESSIONS, '10.0.0.5'],
  ] as const) {
    it(`${tab}: a table skeleton until the list arrives`, async () => {
      const list = held();
      await renderPage('users', withAnswer((p, m) => (p === path && m === 'GET' ? list.promise : undefined)), { path: `/?tab=${tab}` });

      const skeleton = await screen.findByText('Loading…', { selector: '.sr-only' });
      const rows = skeleton.closest('[role=status]')!.querySelectorAll(':scope > div');
      expect(rows).toHaveLength(6);
      expect(rows[1].children.length).toBeGreaterThan(2);

      list.resolve(json(fixtures));
      expect(await screen.findByText(shown)).toBeTruthy();
      expect(screen.queryByText('Loading…', { selector: '.sr-only' })).toBeNull();
    });

    it(`${tab}: a failed list with Retry, and Retry loads it`, async () => {
      let fail = true;
      await renderPage('users', withAnswer((p, m) => (p === path && m === 'GET' && fail ? json({ error: 'store offline' }, 500) : undefined)), { path: `/?tab=${tab}` });

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('store offline');
      fail = false;
      fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
      expect(await screen.findByText(shown)).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  }

  it('account: skeletons of the cards until the session arrives, a failure with Retry that recovers', async () => {
    const first = held();
    let calls = 0;
    await renderPage('account', withAnswer(p => (p === '/api/v1/qcli/sessions/current' && ++calls === 1 ? first.promise : undefined)));

    const skeleton = (await screen.findByText('Loading…', { selector: '.sr-only' })).closest('[role=status]')!;
    expect(skeleton.querySelectorAll('.rounded-xl')).toHaveLength(3);
    first.resolve(json({ error: 'no session store' }, 500));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('no session store');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(await screen.findByDisplayValue('root@example.com')).toBeTruthy();
  });
});

describe('users statistics', () => {
  /** The fixtures' server, with lists the test changes (`null`: that list fails) and every GET recorded. */
  function statsServer(lists: { users?: unknown[] | null; groups?: unknown[] | null; sessions?: unknown[] | null } = {}, gets: string[] = []): FakeServer {
    const base = usersServer([]);
    return async (path, init) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') gets.push(path);
      const key = method === 'GET' && ({ '/api/v1/qcli/users': 'users', '/api/v1/qcli/groups': 'groups', '/api/v1/qcli/sessions': 'sessions' } as const)[path];
      if (key && key in lists) {
        const list = lists[key];
        return list === null ? json({ error: `${key} offline` }, 500) : json(list);
      }
      return base(path, init);
    };
  }

  /** The statistics' cards: label, value and sub, in their order. */
  async function cards() {
    const section = await screen.findByRole('region', { name: 'Statistics' });
    return [...section.children].map(card => [...card.children].map(line => line.textContent));
  }

  /** Server events for the page: `emit` sends one to the listeners of the matching patterns. */
  function withEvents() {
    const listeners: Array<{ pattern: string; listener: (event: Record<string, unknown>) => void }> = [];
    dashboard.context.onServerEvent = (pattern, listener) => {
      const entry = { pattern, listener };
      listeners.push(entry);
      return () => void listeners.splice(listeners.indexOf(entry), 1);
    };
    return (type: string) => listeners
      .filter(({ pattern }) => pattern === '*' || (pattern.endsWith('*') ? type.startsWith(pattern.slice(0, -1)) : type === pattern))
      .forEach(({ listener }) => listener({ type }));
  }

  it('count the users, sign-ins, groups and unexpired sessions', () => {
    const users = [
      ...USERS,
      user('4', 'dave', { lastLoginAt: NOW - 8 * 86_400_000, createdAt: NOW - 40 * 86_400_000 }),
      user('5', 'erin', { lastLoginAt: NOW - 6 * 86_400_000, disabled: true }),
    ] as never[];
    const sessions = [...SESSIONS, { ...SESSIONS[0], id: 's3' }, { ...SESSIONS[1], id: 's4', expiresAt: NOW - 1 }] as never[];
    expect(userStats(users, GROUPS as never[], sessions, NOW)).toEqual({
      users: 5, disabled: 2, active: 2, neverSignedIn: 2, created: 4, mustChangePassword: 1,
      groups: { total: 3, custom: 1 },
      sessions: { total: 3, users: 2 },
    });
    expect(userStats([], null, null, NOW)).toEqual({
      users: 0, disabled: 0, active: 0, neverSignedIn: 0, created: 0, mustChangePassword: 0, groups: null, sessions: null,
    });
  });

  it('shows users, active, signed in now and groups above the tabs, on every tab', async () => {
    await renderPage('users', statsServer());
    expect(await cards()).toEqual([
      ['Users', '3', '1 disabled'],
      ['Active (7 days)', '1', '2 never signed in'],
      ['Signed in now', '2', '2 users'],
      ['Groups', '3', '1 custom'],
    ]);
    // Above the tabs
    const section = screen.getByRole('region', { name: 'Statistics' });
    expect(section.compareDocumentPosition(screen.getByRole('tablist')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Groups' }));
    expect(await screen.findByText('ops')).toBeTruthy();
    expect((await cards())[0]).toEqual(['Users', '3', '1 disabled']);
    fireEvent.click(screen.getByRole('tab', { name: 'Sessions' }));
    expect(await screen.findByText('This session')).toBeTruthy();
    expect((await cards())[2]).toEqual(['Signed in now', '2', '2 users']);
  });

  it('shares the users tab’s request: one load of users and groups for both', async () => {
    const gets: string[] = [];
    await renderPage('users', statsServer({}, gets));
    expect(await screen.findByText('alice@example.com')).toBeTruthy();
    await cards();
    expect(gets.filter(p => p === '/api/v1/qcli/users')).toHaveLength(1);
    expect(gets.filter(p => p === '/api/v1/qcli/groups')).toHaveLength(1);
  });

  it('without sessions:read, shows new users (30 days) instead of sessions and never asks for them', async () => {
    const gets: string[] = [];
    const users = [...USERS, user('4', 'dave', { createdAt: NOW - 40 * 86_400_000 })];
    await renderPage('users', statsServer({ users }, gets), { permissions: ['users:read'] });
    expect(await cards()).toEqual([
      ['Users', '4', '1 disabled'],
      ['Active (7 days)', '1', '3 never signed in'],
      ['New (30 days)', '3', '1 must change password'],
      ['Groups', '3', '1 custom'],
    ]);
    expect(screen.queryByText('Signed in now')).toBeNull();
    expect(gets).not.toContain('/api/v1/qcli/sessions');
  });

  it('holds the cards’ place with four skeletons until the users arrive', async () => {
    let resolve!: (r: Response) => void;
    const users = new Promise<Response>(r => { resolve = r; });
    const base = statsServer();
    await renderPage('users', (p, init) => (p === '/api/v1/qcli/users' ? users : base(p, init)));

    const skeleton = (await screen.findByText('Loading statistics…')).closest('[role=status]')!;
    expect(skeleton.querySelectorAll('.rounded-xl')).toHaveLength(4);
    expect(screen.queryByRole('region', { name: 'Statistics' })).toBeNull();

    resolve(json(USERS));
    expect((await cards())[0]).toEqual(['Users', '3', '1 disabled']);
    expect(screen.queryByText('Loading statistics…')).toBeNull();
  });

  it('shows zeros for an empty list', async () => {
    await renderPage('users', statsServer({ users: [], groups: [], sessions: [] }));
    expect(await cards()).toEqual([
      ['Users', '0', '0 disabled'],
      ['Active (7 days)', '0', '0 never signed in'],
      ['Signed in now', '0', '0 users'],
      ['Groups', '0', '0 custom'],
    ]);
    expect(screen.getByText('There are no users.')).toBeTruthy();
  });

  it('a failed users list: a compact error with Retry above the other tabs, only the table’s error on the users tab', async () => {
    const lists: { users?: unknown[] | null } = { users: null };
    await renderPage('users', statsServer(lists), { path: '/?tab=groups' });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The statistics could not be loaded: users offline');
    lists.users = USERS;
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect((await cards())[0]).toEqual(['Users', '3', '1 disabled']);
    expect(screen.queryByRole('alert')).toBeNull();

    unmount?.();
    unmount = undefined;
    await renderPage('users', statsServer({ users: null }));
    expect((await screen.findAllByRole('alert'))).toHaveLength(1);
    expect(screen.getByRole('alert').textContent).not.toContain('statistics');
    expect(screen.queryByRole('region', { name: 'Statistics' })).toBeNull();
  });

  it('drops the groups card when the groups fail, and shows new users when the sessions fail', async () => {
    await renderPage('users', statsServer({ groups: null, sessions: null }));
    expect(await cards()).toEqual([
      ['Users', '3', '1 disabled'],
      ['Active (7 days)', '1', '2 never signed in'],
      ['New (30 days)', '3', '1 must change password'],
    ]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('updates the numbers live on user, group and session events, keeping the cards while they reload', async () => {
    const lists: { users: unknown[]; groups: unknown[]; sessions: unknown[] } = { users: [...USERS], groups: [...GROUPS], sessions: [...SESSIONS] };
    dashboard = fakeDashboard('users', { server: statsServer(lists) });
    const emit = withEvents();
    unmount = await mountExtension(extension as DashboardExtension, dashboard.context);
    expect((await cards())[0]).toEqual(['Users', '3', '1 disabled']);

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      lists.users = [...USERS, user('4', 'dave', { lastLoginAt: NOW - 1000 })];
      lists.sessions = [...SESSIONS, { ...SESSIONS[0], id: 's3', userId: '4', userName: 'dave' }];
      lists.groups = [...GROUPS, { ...GROUPS[2], id: 'g4', name: 'devs' }];
      act(() => emit('user:created'));
      act(() => emit('session:created'));
      act(() => emit('group:created'));
      await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
      // The cards stay while the data reloads: no skeleton in between
      expect(screen.queryByText('Loading statistics…')).toBeNull();
      await waitFor(async () => expect(await cards()).toEqual([
        ['Users', '4', '1 disabled'],
        ['Active (7 days)', '2', '2 never signed in'],
        ['Signed in now', '3', '3 users'],
        ['Groups', '4', '2 custom'],
      ]));
    } finally {
      vi.useRealTimers();
    }
  });

  it('is translated', async () => {
    await renderPage('users', statsServer(), { language: 'ro' });
    const section = await screen.findByRole('region', { name: 'Statistici' });
    expect(within(section).getByText('Activi (7 zile)')).toBeTruthy();
    expect(within(section).getByText('Dezactivați: 1')).toBeTruthy();
  });
});

describe('long lists', () => {
  const MANY_GROUPS = ['admin', 'users', 'ops', 'devs', 'qa', 'billing', 'support', 'auditors'];
  const MANY_PERMISSIONS = ['jobs:read', 'jobs:run', 'commands:read', 'deploy:run', 'logs:read', 'config:read', 'config:write'];

  /** The fixtures' server with alice in eight groups and ops holding seven permissions. */
  function longListsServer(): FakeServer {
    const base = usersServer([]);
    return async (path, init) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET' && path === '/api/v1/qcli/users') {
        return json(USERS.map(u => (u.name === 'alice' ? { ...u, groups: MANY_GROUPS } : u)));
      }
      if (method === 'GET' && path === '/api/v1/qcli/groups') {
        return json(GROUPS.map(g => (g.name === 'ops' ? { ...g, permissions: MANY_PERMISSIONS } : g)));
      }
      if (path === '/api/v1/qcli/sessions/current') {
        return json({ user: { ...USERS[0], groups: [...MANY_GROUPS, 'extra-1', 'extra-2'] }, permissions: ['*'], usersReadOnly: false, groupsReadOnly: false });
      }
      return base(path, init);
    };
  }

  it('users: three groups in the column, +5 more opens “Groups of alice” with all eight', async () => {
    await renderPage('users', longListsServer());
    const row = (await screen.findByText('alice')).closest('tr')!;
    const groups = within(row).getByRole('list', { name: 'Groups' });
    expect(within(groups).getAllByRole('listitem').map(li => li.textContent)).toEqual(['admin', 'users', 'ops', '+5 more']);
    fireEvent.click(within(row).getByRole('button', { name: '+5 more' }));
    const dialog = screen.getByRole('dialog', { name: 'Groups of alice' });
    expect(within(dialog).getAllByRole('listitem').map(li => li.textContent)).toEqual(MANY_GROUPS);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    // Short lists have no button
    const bobRow = screen.getByText('bob').closest('tr')!;
    expect(within(bobRow).queryByRole('button', { name: /more/ })).toBeNull();
  });

  it('groups: three permissions in the column with their descriptions, the rest in “Permissions of group ops”', async () => {
    await renderPage('users', longListsServer(), { path: '/?tab=groups' });
    const row = (await screen.findByText('ops')).closest('tr')!;
    expect(within(row).getByText('jobs:read').getAttribute('title')).toBe('See jobs');
    expect(within(row).queryByText('logs:read')).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: '+4 more' }));
    const dialog = screen.getByRole('dialog', { name: 'Permissions of group ops' });
    expect(within(dialog).getAllByRole('listitem').map(li => li.textContent)).toEqual(MANY_PERMISSIONS);
  });

  it('account: up to eight groups in the profile, the others in a dialog', async () => {
    await renderPage('account', longListsServer());
    fireEvent.click(await screen.findByRole('button', { name: '+2 more' }));
    const dialog = screen.getByRole('dialog', { name: 'Groups of root' });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(10);
  });

  it('is translated', async () => {
    await renderPage('users', longListsServer(), { language: 'de' });
    const row = (await screen.findByText('alice')).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: '+5 weitere' }));
    expect(screen.getByRole('dialog', { name: 'Gruppen von alice' })).toBeTruthy();
  });
});
