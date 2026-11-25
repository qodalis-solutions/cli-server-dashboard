// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { LOCALES, createApi, type DashboardExtension } from '@qodalis/cli-server-dashboard-kit';
import extension from './index';
import { formatProperties, getAudit } from './api';
import { messages } from './messages';
import { fakeDashboard, json, mountExtension, type FakeServer } from '@qodalis/cli-server-dashboard-kit/testing';

const NOW = Date.now();
const ENTRIES = [
  { id: '1', timestamp: NOW - 60_000, event: 'login_failed', username: 'bob', actor: 'bob', metadata: { remoteAddress: '10.0.0.5' } },
  { id: '2', timestamp: NOW - 120_000, event: 'user_created', username: 'carol', actor: 'root', details: 'created by root' },
  { id: '3', timestamp: NOW - 180_000, event: 'data_query', username: 'root', actor: 'root',
    metadata: { source: 'demo-sqlite', query: 'SELECT 1', success: true, rowCount: 1, durationMs: 4 } },
];

let unmount: (() => void) | undefined;
let dashboard: ReturnType<typeof fakeDashboard>;

async function renderPage(server: FakeServer, path = '/') {
  dashboard = fakeDashboard('audit', { server, path });
  unmount = await mountExtension(extension as DashboardExtension, dashboard.context);
}

afterEach(() => {
  unmount?.();
  unmount = undefined;
  cleanup();
});

describe('getAudit', () => {
  const recorder = () => {
    const paths: string[] = [];
    const api = createApi(async path => {
      paths.push(path);
      return json([]);
    });
    return { api, paths };
  };

  it('sends only the set filters, trimmed', async () => {
    const { api, paths } = recorder();
    await getAudit(api, { event: 'login', actor: ' alice ', username: '', limit: 51, offset: 50 });
    expect(paths[0]).toBe('/api/v1/qcli/audit?event=login&actor=alice&limit=51&offset=50');
  });

  it('asks for everything without filters', async () => {
    const { api, paths } = recorder();
    await getAudit(api);
    expect(paths[0]).toBe('/api/v1/qcli/audit');
  });
});

describe('formatProperties', () => {
  it('formats values as key=value, objects as JSON', () => {
    expect(formatProperties({ items: 32, source: 'bnr', ok: true, none: null, tags: ['a'], range: { from: 1 } }))
      .toEqual(['items=32', 'source=bnr', 'ok=true', 'none=null', 'tags=["a"]', 'range={"from":1}']);
  });

  it('is empty without properties', () => {
    expect(formatProperties(undefined)).toEqual([]);
    expect(formatProperties({})).toEqual([]);
  });
});

describe('audit page', () => {
  it('lists the entries with their facts, the activity and the most frequent events', async () => {
    await renderPage(() => json(ENTRIES));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('login_failed')).toBeTruthy();
    expect(within(table).getByText('10.0.0.5')).toBeTruthy();
    expect(within(table).getByText('demo-sqlite')).toBeTruthy();
    expect(within(table).getByText('SELECT 1')).toBeTruthy();
    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.getByText('Most frequent events')).toBeTruthy();
    expect(screen.getByText('3 entries · who did what, and when')).toBeTruthy();
    // The default range asks the server from 7 days back
    expect(dashboard.state.requests[0].path).toMatch(/^\/api\/v1\/qcli\/audit\?from=.+&limit=1000$/);
  });

  it('searches from the page’s query (?q=), as the command palette opens it', async () => {
    await renderPage(() => json(ENTRIES), '/?q=carol');
    const table = await screen.findByRole('table');
    expect(within(table).getByText('user_created')).toBeTruthy();
    expect(within(table).queryByText('login_failed')).toBeNull();
    expect((screen.getByLabelText('Search the audit log…') as HTMLInputElement).value).toBe('carol');
  });

  it('keeps the filters in the query and asks the server for the event', async () => {
    await renderPage(() => json(ENTRIES));
    const table = await screen.findByRole('table');
    await act(async () => fireEvent.click(within(table).getByTitle('Show only login_failed')));
    expect(dashboard.state.path).toBe('/?event=login_failed');
    await waitFor(() => expect(dashboard.state.requests.some(r => r.path.includes('event=login_failed'))).toBe(true));

    await act(async () => fireEvent.click(screen.getByText('Clear')));
    expect(dashboard.state.path).toBe('/');
  });

  it('shows the server’s refusal', async () => {
    await renderPage(() => json({ error: 'forbidden: missing permission audit:read' }, 403));
    expect(await screen.findByText('forbidden: missing permission audit:read')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Could not load the data');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('speaks the dashboard’s language', async () => {
    dashboard = fakeDashboard('audit', { server: () => json(ENTRIES), language: 'ro' });
    unmount = await mountExtension(extension as DashboardExtension, dashboard.context);
    expect(await screen.findByText('Activitate')).toBeTruthy();
  });
});

// From src/App.test.tsx "audit page"
describe('audit page (from the dashboard)', () => {
  it('lists entries with who, about what and their values, charts them, and filters by actor', async () => {
    const hourAgo = Date.now() - 3_600_000;
    const entries = [
      {
        id: 'a1', timestamp: hourAgo, event: 'role.save', username: '', actor: 'admin@example.com',
        target: 'role:editor', properties: { permissions: ['jobs.view'], count: 2 },
        metadata: { remoteAddress: '10.0.0.1' },
      },
      { id: 'a2', timestamp: hourAgo - 60_000, event: 'login_failed', username: 'bob', details: 'wrong password' },
    ];
    await renderPage(() => json(entries));

    // In the table and in the most frequent events and users
    expect((await screen.findAllByText('role.save')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('admin@example.com').length).toBe(2);
    expect(screen.getByText('role:editor')).toBeTruthy();
    expect(screen.getByText('permissions=["jobs.view"]')).toBeTruthy();
    expect(screen.getByText('count=2')).toBeTruthy();
    expect(screen.getByText('10.0.0.1')).toBeTruthy();
    expect(screen.getByText('wrong password')).toBeTruthy();
    expect(screen.getByText('Activity')).toBeTruthy();

    // The range's entries, as many as the server sends at once
    const paths = () => dashboard.state.requests.map(r => r.path);
    expect(paths().find(u => u.startsWith('/api/v1/qcli/audit'))).toMatch(/^\/api\/v1\/qcli\/audit\?from=[^&]+&limit=1000$/);

    await act(async () => fireEvent.change(screen.getByLabelText('By (user)'), { target: { value: ' admin@example.com ' } }));
    await waitFor(() => expect(paths().some(u => u.startsWith('/api/v1/qcli/audit?actor=admin%40example.com&from='))).toBe(true));
    expect(dashboard.state.path).toBe('/?actor=+admin%40example.com+');
  });
});

describe('audit messages', () => {
  it('translate every English text in the 10 other languages', () => {
    const en = Object.keys(messages.audit.en);
    const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '');
    for (const { code } of LOCALES.filter(l => l.code !== 'en')) {
      const own = messages.audit[code as Exclude<typeof code, 'en'>] ?? {};
      const missing = en.filter(key => !(key in own) && !(base(key) !== key && `${base(key)}_other` in own));
      expect({ code, missing }).toEqual({ code, missing: [] });
    }
  });
});

describe('audit page loading, retry and paging', () => {
  it('shows a skeleton of the chart, top lists and table until the log arrives', async () => {
    let answer!: (r: Response) => void;
    await renderPage(() => new Promise<Response>(r => { answer = r; }));

    const skeletons = screen.getAllByRole('status');
    expect(skeletons.map(s => s.textContent)).toEqual(['Loading the audit log…', 'Loading…', 'Loading…', 'Loading…']);
    expect(skeletons[0].querySelector('[style*="height: 162px"]')).not.toBeNull();

    await act(async () => answer(json(ENTRIES)));
    expect(await screen.findByText('created by root')).toBeTruthy();
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });

  it('Retry after a failure loads the log', async () => {
    let fail = true;
    await renderPage(() => (fail ? json({ error: 'audit store offline' }, 500) : json(ENTRIES)));
    expect((await screen.findByRole('alert')).textContent).toContain('audit store offline');

    fail = false;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
    expect(await screen.findByText('created by root')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('pages the entries with the kit controls (20 rows per page by default)', async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({
      id: String(i), timestamp: NOW - i * 1000, event: 'user_updated', username: `user${i}`, actor: 'root', details: `change ${i}`,
    }));
    await renderPage(() => json(many));
    expect(await screen.findByText('change 0')).toBeTruthy();
    expect(screen.queryByText('change 20')).toBeNull();
    const pager = screen.getByRole('navigation', { name: 'Pages' });
    expect(pager.textContent).toContain('1–20 of 45');

    await act(async () => fireEvent.click(within(pager).getByRole('button', { name: 'Next' })));
    expect(screen.getByText('change 20')).toBeTruthy();
    expect(screen.queryByText('change 0')).toBeNull();
  });
});
