// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  it('shows a skeleton of the statistics, chart, top lists and table until the log arrives', async () => {
    let answer!: (r: Response) => void;
    await renderPage(() => new Promise<Response>(r => { answer = r; }));

    const skeletons = screen.getAllByRole('status');
    expect(skeletons.map(s => s.textContent)).toEqual(['Loading statistics…', 'Loading the audit log…', 'Loading…', 'Loading…', 'Loading…']);
    expect(skeletons[1].querySelector('[style*="height: 162px"]')).not.toBeNull();

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

describe('audit statistics', () => {
  const MIN = 60_000;
  const STATS_ENTRIES = [
    { id: 's1', timestamp: NOW - 1 * MIN, event: 'login', username: 'alice', actor: 'alice' },
    { id: 's2', timestamp: NOW - 2 * MIN, event: 'login_failed', username: 'bob', actor: 'bob' },
    { id: 's3', timestamp: NOW - 3 * MIN, event: 'login_failed', username: 'bob', actor: 'bob' },
    { id: 's4', timestamp: NOW - 4 * MIN, event: 'user_created', username: 'carol', actor: 'root' },
    { id: 's5', timestamp: NOW - 5 * MIN, event: 'user_updated', username: 'carol', actor: 'root' },
    { id: 's6', timestamp: NOW - 6 * MIN, event: 'user_updated', username: 'dave', actor: 'root' },
    { id: 's7', timestamp: NOW - 7 * MIN, event: 'data_query', username: 'root', actor: 'root' },
    { id: 's8', timestamp: NOW - 2 * 24 * 60 * MIN, event: 'config.update', username: '', actor: 'alice' },
  ];
  const midnight = () => new Date(Date.now()).setHours(0, 0, 0, 0);
  const today = (entries: { timestamp: number }[]) => entries.filter(e => e.timestamp >= midnight()).length;

  /** The cards: label, value and sub, in their order. */
  async function cards() {
    const section = await screen.findByRole('region', { name: 'Statistics' });
    return [...section.children].map(card => [...card.children].map(line => line.textContent));
  }

  /** Answers with the entries the server's actor filter keeps. */
  const byActor = (entries: typeof STATS_ENTRIES): FakeServer => path => {
    const actor = new URL(path, 'http://x').searchParams.get('actor');
    return json(actor ? entries.filter(e => e.actor === actor) : entries);
  };

  it('shows the events, active users, sign-ins and changes of the range above the chart', async () => {
    await renderPage(byActor(STATS_ENTRIES));
    expect(await cards()).toEqual([
      ['Events', '8', `Last 7 days · ${today(STATS_ENTRIES)} today`],
      ['Active users', '3', 'Most active: root'],
      ['Sign-ins', '1', '2 failed'],
      ['Changes', '4', 'Most frequent: user_updated'],
    ]);
    const section = screen.getByRole('region', { name: 'Statistics' });
    expect(section.className).toContain('grid-cols-2');
    expect(section.className).toContain('lg:grid-cols-4');
    expect(section.children[2].lastElementChild!.className).toContain('text-error');
    expect(section.compareDocumentPosition(screen.getByText('Activity')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows zeros for an empty log, with no highlight', async () => {
    await renderPage(() => json([]));
    expect(await cards()).toEqual([
      ['Events', '0', 'Last 7 days · 0 today'],
      ['Active users', '0', 'None'],
      ['Sign-ins', '0', 'None failed'],
      ['Changes', '0', 'No changes'],
    ]);
    const section = screen.getByRole('region', { name: 'Statistics' });
    expect(section.children[2].lastElementChild!.className).not.toContain('text-error');
  });

  it('holds the cards\u2019 place with four skeletons until the log arrives', async () => {
    let answer!: (r: Response) => void;
    await renderPage(() => new Promise<Response>(r => { answer = r; }));
    const skeleton = screen.getAllByRole('status').find(s => s.textContent === 'Loading statistics…')!;
    expect(skeleton.querySelectorAll('.rounded-xl')).toHaveLength(4);
    expect(skeleton.parentElement!.className).toContain('lg:grid-cols-4');
    expect(screen.queryByRole('region', { name: 'Statistics' })).toBeNull();

    await act(async () => answer(json(STATS_ENTRIES)));
    expect((await cards())[0][1]).toBe('8');
    expect(screen.queryByText('Loading statistics…')).toBeNull();
  });

  it('shows no cards beside a failed log', async () => {
    await renderPage(() => json({ error: 'audit store offline' }, 500));
    expect((await screen.findByRole('alert')).textContent).toContain('audit store offline');
    expect(screen.queryByRole('region', { name: 'Statistics' })).toBeNull();
    expect(screen.queryByText('Loading statistics…')).toBeNull();
  });

  it('counts only the selected range, and says which', async () => {
    await renderPage(byActor(STATS_ENTRIES), '/?range=24h');
    const inDay = STATS_ENTRIES.filter(e => e.id !== 's8');
    expect(await cards()).toEqual([
      ['Events', '7', `Last 24 hours · ${today(inDay)} today`],
      ['Active users', '3', 'Most active: root'],
      ['Sign-ins', '1', '2 failed'],
      ['Changes', '3', 'Most frequent: user_updated'],
    ]);
  });

  it('marks a full page of entries as a lower bound', async () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ id: `m${i}`, timestamp: NOW - i * 1000, event: 'login', username: 'u', actor: 'u' }));
    await renderPage(() => json(many));
    expect((await cards())[0][1]).toBe('1,000+');
  });

  it('follows the filters: the search right away, the user from the server, keeping the cards meanwhile', async () => {
    let held: ((r: Response) => void) | null = null;
    let hold = false;
    const server = byActor(STATS_ENTRIES);
    await renderPage((path, init) => (hold ? new Promise<Response>(r => { held = () => r(server(path, init) as Response); }) : server(path, init)));
    expect((await cards())[0][1]).toBe('8');

    // The text search runs over what the server sent
    await act(async () => fireEvent.change(screen.getByLabelText('Search the audit log…'), { target: { value: 'carol' } }));
    expect(await cards()).toEqual([
      ['Events', '2', `Last 7 days · ${today(STATS_ENTRIES.filter(e => e.username === 'carol'))} today`],
      ['Active users', '1', 'Most active: root'],
      ['Sign-ins', '0', 'None failed'],
      ['Changes', '2', 'Most frequent: user_created'],
    ]);
    await act(async () => fireEvent.change(screen.getByLabelText('Search the audit log…'), { target: { value: '' } }));

    // The actor filter asks the server again; the old numbers stay until it answers
    hold = true;
    await act(async () => fireEvent.change(screen.getByLabelText('By (user)'), { target: { value: 'bob' } }));
    await waitFor(() => expect(held).toBeTypeOf('function'));
    expect((await cards())[0][1]).toBe('8');
    expect(screen.queryByText('Loading statistics…')).toBeNull();

    await act(async () => held!(new Response()));
    await waitFor(async () => expect(await cards()).toEqual([
      ['Events', '2', `Last 7 days · ${today(STATS_ENTRIES.filter(e => e.actor === 'bob'))} today`],
      ['Active users', '1', 'Most active: bob'],
      ['Sign-ins', '0', '2 failed'],
      ['Changes', '0', 'No changes'],
    ]));
  });

  it('updates live when an entry is recorded, keeping the cards while the log reloads', async () => {
    let entries = STATS_ENTRIES;
    let held: ((r: Response) => void) | null = null;
    const listeners: Array<(event: Record<string, unknown>) => void> = [];
    dashboard = fakeDashboard('audit', {
      server: () => (entries === STATS_ENTRIES ? json(entries) : new Promise<Response>(r => { held = r; })),
    });
    dashboard.context.onServerEvent = (pattern, listener) => {
      if (pattern === 'audit:recorded') listeners.push(listener);
      return () => {};
    };
    unmount = await mountExtension(extension as DashboardExtension, dashboard.context);
    expect((await cards())[2]).toEqual(['Sign-ins', '1', '2 failed']);

    const recorded = { id: 's9', timestamp: Date.now(), event: 'login_failed', username: 'eve', actor: 'eve' };
    entries = [recorded, ...STATS_ENTRIES];
    vi.useFakeTimers();
    try {
      act(() => listeners.forEach(l => l({ type: 'audit:recorded', ...recorded })));
      await act(async () => { vi.advanceTimersByTime(2000); });
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(held).toBeTypeOf('function'));
    // Reloading quietly: the cards stay, no skeleton
    expect((await cards())[2]).toEqual(['Sign-ins', '1', '2 failed']);
    expect(screen.queryByText('Loading statistics…')).toBeNull();

    await act(async () => held!(json(entries)));
    await waitFor(async () => expect(await cards()).toEqual([
      ['Events', '9', `Last 7 days · ${today(entries)} today`],
      ['Active users', '4', 'Most active: root'],
      ['Sign-ins', '1', '3 failed'],
      ['Changes', '4', 'Most frequent: user_updated'],
    ]));
  });

  it('is translated', async () => {
    dashboard = fakeDashboard('audit', { server: () => json(STATS_ENTRIES), language: 'ro' });
    unmount = await mountExtension(extension as DashboardExtension, dashboard.context);
    const section = await screen.findByRole('region', { name: 'Statistici' });
    expect(within(section).getByText('Autentificări')).toBeTruthy();
    expect(within(section).getByText('2 eșuate')).toBeTruthy();
    expect(within(section).getByText('Cel mai activ: root')).toBeTruthy();
  });
});
