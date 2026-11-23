// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { LOCALES, type DashboardExtension, type DashboardExtensionContext } from '@qodalis/cli-server-dashboard-kit';
import extension, { folderOf } from './index';
import { pathIn, uploadFile } from './api';
import { messages } from './messages';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const FOLDERS: Record<string, Array<{ name: string; type: 'file' | 'directory'; size: number; modified: string }>> = {
  '/': [
    { name: 'reports', type: 'directory', size: 0, modified: '2026-11-23T10:00:00.000Z' },
    { name: 'notes.txt', type: 'file', size: 2048, modified: '2026-11-23T10:00:00.000Z' },
  ],
  '/reports': [{ name: 'rates.csv', type: 'file', size: 5, modified: '2026-11-23T10:00:00.000Z' }],
};

let requests: Array<{ path: string; init?: RequestInit }>;
let host: HTMLDivElement;
let unmount: (() => void) | void;
let path: string;
let pathListeners: Set<(p: string) => void>;
let eventListeners: Map<string, Set<(e: Record<string, unknown>) => void>>;

function fetcher(p: string, init?: RequestInit): Promise<Response> {
  requests.push({ path: p, init });
  const url = new URL(p, 'http://host');
  const folder = url.searchParams.get('path') ?? '/';
  if (url.pathname === '/api/qcli/fs/ls') return Promise.resolve(FOLDERS[folder] ? json({ entries: FOLDERS[folder] }) : json({ error: 'not found' }, 404));
  if (url.pathname === '/api/qcli/fs/cat') return Promise.resolve(json({ content: 'line 1\nline 2' }));
  if (url.pathname === '/api/qcli/fs/upload') return Promise.resolve(json({ path: '/x', size: 1 }));
  if (url.pathname === '/api/qcli/fs/mkdir') return Promise.resolve(json({}));
  if (url.pathname === '/api/qcli/fs/rm') return Promise.resolve(json({}));
  return Promise.resolve(json({ error: 'not found' }, 404));
}

function context(): DashboardExtensionContext {
  return {
    extension: { id: 'filesystem', title: 'Filesystem', entry: '/x.js' },
    apiBase: '',
    fetch: async (p, init) => fetcher(p, init),
    user: { id: '1', name: 'root' },
    permissions: ['*'],
    hasPermission: () => true,
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
    onServerEvent: (pattern, listener) => {
      const set = eventListeners.get(pattern) ?? new Set();
      set.add(listener);
      eventListeners.set(pattern, set);
      return () => void set.delete(listener);
    },
    notify: () => {},
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
  path = '/';
  pathListeners = new Set();
  eventListeners = new Map();
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => {
    if (typeof unmount === 'function') unmount();
  });
  host.remove();
  vi.useRealTimers();
});

describe('filesystem page', () => {
  it('lists the root, opens a folder through the path, and reads a file', async () => {
    await mount();
    expect(await screen.findByText('notes.txt')).toBeTruthy();
    expect(screen.getByText('2.0 KB')).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByText('reports')));
    expect(path).toBe('/?path=%2Freports');
    expect(await screen.findByText('rates.csv')).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByText('rates.csv')));
    expect(await screen.findByText('line 2')).toBeTruthy();

    // The breadcrumb's root goes back up
    await act(async () => fireEvent.click(within(screen.getByRole('navigation', { name: 'Path' })).getByTitle('Root directory')));
    expect(path).toBe('/');
    expect(await screen.findByText('notes.txt')).toBeTruthy();
  });

  it('creates a folder and deletes an entry, listing the folder again', async () => {
    await mount();
    await screen.findByText('notes.txt');

    fireEvent.click(screen.getByText('New Folder'));
    fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'archive' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create' })));
    const mkdir = requests.find((r) => r.path === '/api/qcli/fs/mkdir');
    expect(JSON.parse(String(mkdir?.init?.body))).toEqual({ path: '/archive' });

    const row = screen.getByText('notes.txt').closest('tr')!;
    await act(async () => fireEvent.click(within(row).getByRole('button', { name: 'Delete' })));
    await act(async () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' })));
    expect(requests.some((r) => r.path === '/api/qcli/fs/rm?path=%2Fnotes.txt' && r.init?.method === 'DELETE')).toBe(true);
    expect(requests.filter((r) => r.path.startsWith('/api/qcli/fs/ls')).length).toBeGreaterThanOrEqual(3);
  });

  it('lists the folder again when the server reports a change in it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await mount();
    await screen.findByText('notes.txt');
    const listed = () => requests.filter((r) => r.path.startsWith('/api/qcli/fs/ls')).length;
    const before = listed();

    const emit = (event: Record<string, unknown>) => eventListeners.get('fs:changed')?.forEach((fn) => fn(event));
    act(() => emit({ type: 'fs:changed', path: '/elsewhere/file.txt' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(listed()).toBe(before);

    act(() => emit({ type: 'fs:changed', path: '/new.txt' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await waitFor(() => expect(listed()).toBe(before + 1));
  });

  it('reads the folder from the path', () => {
    expect(folderOf('/')).toBe('/');
    expect(folderOf('/?path=%2Freports%2F2026')).toBe('/reports/2026');
  });
});

describe('filesystem api', () => {
  it('joins a folder and a name, at the root and below it', () => {
    expect(pathIn('/', 'rates.csv')).toBe('/rates.csv');
    expect(pathIn('/reports', 'rates.csv')).toBe('/reports/rates.csv');
    expect(pathIn('/reports/', 'rates.csv')).toBe('/reports/rates.csv');
  });

  it('uploads the file with its full path, folder and file name, as every server expects', async () => {
    const fetchMock = vi.fn<(p: string, init?: RequestInit) => Promise<Response>>(async () => json({ path: '/reports/rates.csv', size: 5 }));
    await uploadFile(fetchMock, '/reports', new File(['EUR,1'], 'rates.csv'));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/qcli/fs/upload');
    const form = init?.body as FormData;
    expect(form.get('path')).toBe('/reports/rates.csv');
    expect((form.get('file') as File).name).toBe('rates.csv');
  });

  it("reports the server's error of a failed upload", async () => {
    await expect(uploadFile(async () => json({ error: 'path required' }, 400), '/', new File(['x'], 'x.txt'))).rejects.toThrow('path required');
  });
});

describe('filesystem messages', () => {
  it('translate every English text in the 10 other languages', () => {
    const en = Object.keys(messages.filesystem.en);
    for (const { code } of LOCALES.filter((l) => l.code !== 'en')) {
      const own = messages.filesystem[code as Exclude<typeof code, 'en'>] ?? {};
      const missing = en.filter((key) => !(key in own));
      expect({ code, missing }).toEqual({ code, missing: [] });
    }
  });
});
