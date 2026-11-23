// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { LOCALES, type DashboardExtension, type DashboardExtensionContext } from '@qodalis/cli-server-dashboard-kit';
import extension from './index';
import { messages } from './messages';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const DATABASES = {
  databases: [
    {
      name: 'main', dialect: 'postgres', sources: ['ef', 'qcli-audit'], applied: 1, pending: 1, problems: 0, sizeBytes: 9_437_184,
      lastRun: { id: 'r1', direction: 'up', status: 'succeeded', startedAt: '2026-11-23T10:00:00.000Z', finishedAt: '2026-11-23T10:00:01.000Z', trigger: 'startup' },
    },
    { name: 'files', dialect: 'sqlite', sources: ['qcli-filesystem'], applied: 0, pending: 0, problems: 0, error: 'unable to open database file' },
  ],
};
const DETAIL = {
  name: 'main', dialect: 'postgres', sources: ['ef'],
  migrations: [
    { source: 'ef', id: '20260101000000_CreateNotes', name: 'CreateNotes', status: 'applied', appliedAt: '2026-11-23T10:00:00.000Z', durationMs: 12, appliedBy: 'root', hasDown: true },
    { source: 'ef', id: '20260102000000_CreateTags', name: 'CreateTags', status: 'pending', hasDown: true },
  ],
};
let statsCalls = 0;
const stats = () => {
  statsCalls++;
  return {
    name: 'main', dialect: 'postgres', collectedAt: new Date(Date.UTC(2026, 10, 23, 12, 0, statsCalls * 10)).toISOString(),
    server: { version: 'PostgreSQL 17.2', uptimeSeconds: 90_000 },
    size: { bytes: 9_437_184, dataBytes: 8_388_608, indexBytes: 1_048_576 },
    connections: { active: 2, open: 7, max: 100 },
    counters: { transactions: 1000 + statsCalls * 50, commits: 990, rollbacks: 10 },
    countersScope: 'database',
    cacheHitRatio: 0.987,
    tables: [{ schema: 'public', name: 'Notes', rows: 1200, bytes: 2_097_152 }],
    unavailable: [{ metric: 'tables', error: 'nope' }],
  };
};
const RUN = {
  id: 'r2', direction: 'up', status: 'succeeded', trigger: 'api', actor: 'root', startedAt: '2026-11-23T11:00:00.000Z', finishedAt: '2026-11-23T11:00:00.040Z',
  applied: [{ source: 'ef', id: '20260102000000_CreateTags', name: 'CreateTags', durationMs: 40 }],
};

let requests: Array<{ path: string; init?: RequestInit }>;
let host: HTMLDivElement;
let unmount: (() => void) | void;
let path: string;
let pathListeners: Set<(p: string) => void>;
let permissions: string[];
const notify = vi.fn();

function context(): DashboardExtensionContext {
  return {
    extension: { id: 'databases', title: 'Databases', entry: '/x.js' },
    apiBase: '',
    fetch: async (p: string, init?: RequestInit) => {
      requests.push({ path: p, init });
      if (p === '/api/v1/qcli/databases') return json(DATABASES);
      if (p === '/api/v1/qcli/databases/main/stats') return json(stats());
      if (p === '/api/v1/qcli/databases/main/migrations') return json(DETAIL);
      if (p.startsWith('/api/v1/qcli/databases/main/migrations/runs')) return json({ items: [RUN], total: 1 });
      if (p.startsWith('/api/v1/qcli/databases/main/migrations/sql')) return json({ sql: '-- ef:20260102000000_CreateTags CreateTags (up)\nCREATE TABLE "Tags" ();' });
      if (p === '/api/v1/qcli/databases/main/migrations/up') return json(RUN);
      return json({ error: 'not found' }, 404);
    },
    user: { id: '1', name: 'root' },
    get permissions() { return permissions; },
    hasPermission: (p) => permissions.includes('*') || permissions.includes(p),
    theme: 'light',
    onThemeChange: () => () => {},
    language: 'en',
    onLanguageChange: () => () => {},
    get path() { return path; },
    navigate: (to) => {
      path = to;
      pathListeners.forEach((fn) => fn(to));
    },
    onPathChange: (fn) => {
      pathListeners.add(fn);
      return () => void pathListeners.delete(fn);
    },
    onServerEvent: () => () => {},
    notify,
    confirm: async () => true,
    dashboardVersion: 'test',
    apiVersion: 1,
  };
}

async function mount() {
  await act(async () => {
    unmount = await (extension as DashboardExtension).mount(host, context());
  });
}

beforeEach(() => {
  requests = [];
  statsCalls = 0;
  path = '/';
  pathListeners = new Set();
  permissions = ['*'];
  notify.mockReset();
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => {
    if (typeof unmount === 'function') unmount();
  });
  host.remove();
});

describe('databases page', () => {
  it('lists the databases with their size, counts, last run and errors, and opens one', async () => {
    await mount();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('main')).toBeTruthy();
    expect(within(table).getByText('postgres')).toBeTruthy();
    expect(within(table).getByText('9 MB')).toBeTruthy();
    expect(within(table).getByText('Succeeded')).toBeTruthy();
    expect(within(table).getByText('Unavailable: unable to open database file')).toBeTruthy();

    await act(async () => fireEvent.click(within(table).getByText('main')));
    expect(path).toBe('/db/main');
    expect(await screen.findByText('Database: main')).toBeTruthy();
  });

  it("shows a database's overview: size, connections, rates after two samples, cache, tables", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      path = '/db/main';
      await mount();
      expect(await screen.findByText('Notes')).toBeTruthy();
      expect(screen.getByText('9 MB')).toBeTruthy();
      expect(screen.getByText('Data 8 MB · Indexes 1 MB')).toBeTruthy();
      expect(screen.getByText('2 active · 7 open · max 100')).toBeTruthy();
      expect(screen.getByText('98.7%')).toBeTruthy();
      expect(screen.getByText('PostgreSQL 17.2 · Uptime: 1 d 1 h')).toBeTruthy();
      expect(screen.getByText('Rates appear after the next sample.')).toBeTruthy();
      expect(screen.getByText('Not available: tables')).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      // 50 transactions in 10 s
      await waitFor(() => expect(screen.queryByText('Rates appear after the next sample.')).toBeNull());
      expect(screen.getAllByText('5').length).toBeGreaterThan(0);
      expect(statsCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a database's migrations, previews the SQL, applies and reports", async () => {
    path = '/db/main/migrations';
    await mount();
    expect(await screen.findByText('ef:20260102000000_CreateTags')).toBeTruthy();
    expect(screen.getAllByText('Applied').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);

    await act(async () => fireEvent.click(screen.getByText('Migrate to here')));
    expect(await screen.findByText(/CREATE TABLE "Tags"/)).toBeTruthy();
    expect(requests.some((r) => r.path === '/api/v1/qcli/databases/main/migrations/sql?direction=up&to=ef%3A20260102000000_CreateTags')).toBe(true);

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Apply' })));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Applied 1 migration', 'success'));
    const post = requests.find((r) => r.path === '/api/v1/qcli/databases/main/migrations/up');
    expect(JSON.parse(String(post?.init?.body))).toEqual({ to: 'ef:20260102000000_CreateTags', force: false });
  });

  it('hides the actions without databases:migrate', async () => {
    permissions = ['databases:read'];
    path = '/db/main/migrations';
    await mount();
    expect(await screen.findByText('ef:20260102000000_CreateTags')).toBeTruthy();
    expect(screen.queryByText('Migrate to here')).toBeNull();
    expect(screen.queryByText('Apply pending')).toBeNull();
    expect(screen.getByText('Running migrations needs the databases:migrate permission.')).toBeTruthy();
  });

  it('lists the runs and shows one', async () => {
    path = '/db/main/runs';
    await mount();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Dashboard / API')).toBeTruthy();
    await act(async () => fireEvent.click(within(table).getByText('Dashboard / API')));
    expect(await screen.findByText(/ef:20260102000000_CreateTags/)).toBeTruthy();
  });
});

describe('databases messages', () => {
  it('translate every English text in the 10 other languages', () => {
    const en = Object.keys(messages.databases.en);
    const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '');
    for (const { code } of LOCALES.filter((l) => l.code !== 'en')) {
      const own = messages.databases[code as Exclude<typeof code, 'en'>] ?? {};
      const missing = en.filter((key) => !(key in own) && !(base(key) !== key && `${base(key)}_other` in own));
      expect({ code, missing }).toEqual({ code, missing: [] });
    }
  });
});
