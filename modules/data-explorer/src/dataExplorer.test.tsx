// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { LOCALES, type DashboardExtension, type DashboardExtensionContext } from '@qodalis/cli-server-dashboard-kit';
import extension, { sourceOf } from './index';
import { messages } from './messages';
import type { SqlEditorProps } from './SqlEditor';

// CodeMirror is covered by SqlEditor.test.tsx; here the lazy editor is a text area that records its props
const editorProps: SqlEditorProps[] = [];
vi.mock('./SqlEditor', () => ({
  default: (props: SqlEditorProps) => {
    editorProps.push(props);
    return (
      <textarea
        aria-label={props.ariaLabel}
        data-dialect={props.dialect}
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) props.onRun(); }}
      />
    );
  },
}));

const SOURCES = [
  {
    name: 'demo-sqlite',
    description: 'Demo SQLite database',
    language: 'sql',
    defaultOutputFormat: 'table',
    templates: [{ name: 'list_tables', query: "SELECT name FROM sqlite_master WHERE type='table';" }],
    parameters: [],
    readOnly: true,
    canExport: true,
  },
  { name: 'cache', description: 'Redis', language: 'redis', defaultOutputFormat: 'json', templates: [], parameters: [], readOnly: false },
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetcher: (path: string, init?: RequestInit) => Promise<Response>;
let host: HTMLDivElement;
let unmount: (() => void) | void;
let path: string;
let pathListeners: Set<(p: string) => void>;

function server(execute: (body: { source: string; query: string }) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/data-explorer/sources')) return json(SOURCES);
    if (url.includes('/data-explorer/schema')) {
      return json({ source: 'demo-sqlite', tables: [{ name: 'users', type: 'table', columns: [{ name: 'id', type: 'INTEGER', nullable: false, primaryKey: true }] }] });
    }
    if (url.endsWith('/data-explorer/execute')) return execute(JSON.parse(String(init?.body)));
    return json({ error: 'not found' }, 404);
  });
  fetcher = fetchMock;
  return fetchMock;
}

function context(): DashboardExtensionContext {
  return {
    extension: { id: 'data-explorer', title: 'Data explorer', entry: '/x.js' },
    apiBase: '',
    fetch: (p, init) => fetcher(p, init),
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
    onServerEvent: () => () => {},
    notify: () => {},
    confirm: async () => true,
    dashboardVersion: 'test',
    apiVersion: 1,
  };
}

async function renderPage() {
  await act(async () => {
    unmount = await (extension as DashboardExtension).mount(host, context());
  });
}

beforeEach(() => {
  editorProps.length = 0;
  path = '/';
  pathListeners = new Set();
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => {
    if (typeof unmount === 'function') unmount();
  });
  host.remove();
});

describe('data explorer page', () => {
  it('lists sources with their badges and runs a template', async () => {
    const queries: string[] = [];
    server(body => {
      queries.push(body.query);
      return json({ success: true, source: body.source, executionTime: 7, columns: ['name'], rows: [['users'], ['orders']], rowCount: 2, truncated: true, error: null });
    });
    await renderPage();

    const nav = await screen.findByRole('navigation', { name: 'Sources' });
    expect(within(nav).getByText('demo-sqlite')).toBeTruthy();
    expect(within(nav).getByText('Read-only')).toBeTruthy();
    expect(within(nav).getByText('Export allowed')).toBeTruthy();
    expect(within(nav).getByText('Writes allowed')).toBeTruthy();

    fireEvent.click(screen.getByRole('combobox', { name: 'Templates' }));
    fireEvent.click(screen.getByRole('option', { name: /list_tables/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('orders')).toBeTruthy();
    expect(screen.getByText('2 rows')).toBeTruthy();
    expect(screen.getByText('7 ms')).toBeTruthy();
    expect(screen.getByText('Truncated')).toBeTruthy();
    expect(queries).toEqual(["SELECT name FROM sqlite_master WHERE type='table';"]);
  });

  it('shows a write refused by a read-only source', async () => {
    server(body => json({
      success: false, source: body.source, executionTime: 0, columns: null, rows: [], rowCount: 0, truncated: false,
      error: 'read_only: the source only allows reads (DELETE)', errorCode: 'read_only',
    }));
    await renderPage();

    fireEvent.change(await screen.findByLabelText('Query'), { target: { value: 'DELETE FROM users' } });
    fireEvent.keyDown(screen.getByLabelText('Query'), { key: 'Enter', ctrlKey: true });

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('This source is read-only')).toBeTruthy();
    expect(within(alert).getByText('read_only: the source only allows reads (DELETE)')).toBeTruthy();
  });

  it('explains a query refused for using a masked column', async () => {
    server(body => json({
      success: false, source: body.source, executionTime: 0, columns: null, rows: [], rowCount: 0, truncated: false,
      error: "Masked column 'email' can only be selected by its own name", errorCode: 'masked_column',
    }));
    await renderPage();

    fireEvent.change(await screen.findByLabelText('Query'), { target: { value: 'SELECT email AS e FROM users' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Masked column')).toBeTruthy();
    expect(within(alert).getByText(/Select them by their own name or with SELECT \*/)).toBeTruthy();
    expect(within(alert).getByText("Masked column 'email' can only be selected by its own name")).toBeTruthy();
  });

  it('shows permission and rate limit refusals (403/429)', async () => {
    let status = 403;
    server(() => json({ error: status === 403 ? 'forbidden: missing permission data:demo' : 'Too many queries: at most 1 per 60 s' }, status));
    await renderPage();

    fireEvent.change(await screen.findByLabelText('Query'), { target: { value: 'SELECT 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(within(await screen.findByRole('alert')).getByText('Not allowed')).toBeTruthy();

    status = 429;
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Too many queries')).toBeTruthy();
  });

  it('keeps a query per source and browses the schema', async () => {
    server(() => json({}));
    await renderPage();

    fireEvent.change(await screen.findByLabelText('Query'), { target: { value: 'SELECT 1' } });
    fireEvent.click(screen.getByRole('button', { name: /^cache/ }));
    expect((screen.getByLabelText('Query') as HTMLTextAreaElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /^demo-sqlite/ }));
    expect((screen.getByLabelText('Query') as HTMLTextAreaElement).value).toBe('SELECT 1');

    fireEvent.click(screen.getByRole('button', { name: 'Schema' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Query this table' }));
    expect((screen.getByLabelText('Query') as HTMLTextAreaElement).value).toBe('SELECT * FROM users LIMIT 100;');
  });

  it('puts a result that answers after a switch on its own source', async () => {
    let answer: (r: Response) => void = () => {};
    server(() => new Promise<Response>(resolve => { answer = resolve; }));
    await renderPage();

    fireEvent.change(await screen.findByLabelText('Query'), { target: { value: 'SELECT 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    fireEvent.click(screen.getByRole('button', { name: /^cache/ }));
    answer(json({ success: true, source: 'demo-sqlite', executionTime: 1, columns: ['n'], rows: [[1]], rowCount: 1, truncated: false, error: null }));

    expect(await screen.findByRole('button', { name: 'Run' })).toBeTruthy();
    expect(screen.queryByText('1 row')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^demo-sqlite/ }));
    expect(await screen.findByText('1 row')).toBeTruthy();
  });

  it('edits SQL in the dialect of the source, completing names from its schema', async () => {
    server(() => json({}));
    await renderPage();

    const editor = await screen.findByLabelText('Query');
    // The editor (lazy) for the SQL source; the schema is loaded for completion without opening the panel
    await waitFor(() => expect(editor.getAttribute('data-dialect')).toBe('sqlite'));
    await waitFor(() => expect(Object.keys(editorProps[editorProps.length - 1].schema ?? {})).toEqual(['users']));

    // Redis keeps the plain text area
    fireEvent.click(screen.getByRole('button', { name: /^cache/ }));
    expect(screen.getByLabelText('Query').getAttribute('data-dialect')).toBeNull();
    expect(screen.getByLabelText('Query').tagName).toBe('TEXTAREA');
  });

  it('shows the query as the server ran it and puts it in the editor', async () => {
    server(body => json({
      success: true, source: body.source, executionTime: 1, columns: ['n'], rows: [[1]], rowCount: 1, truncated: false, error: null,
      executedQuery: 'select * from "Users"',
    }));
    await renderPage();

    fireEvent.change(await screen.findByLabelText('Query'), { target: { value: 'select * from Users' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('Ran as:')).toBeTruthy();
    expect(screen.getByText('select * from "Users"')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit this query' }));
    expect((screen.getByLabelText('Query') as HTMLTextAreaElement).value).toBe('select * from "Users"');
  });

  it('keeps the chosen source in the path', async () => {
    server(() => json({}));
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /^cache/ }));
    expect(path).toBe('/?source=cache');
    expect(sourceOf(path)).toBe('cache');
  });

  it('shows the executed query of a failed query, and no note without one', async () => {
    let executedQuery: string | undefined = 'select * from "Users"';
    server(body => json({
      success: false, source: body.source, executionTime: 0, columns: null, rows: [], rowCount: 0, truncated: false,
      error: 'relation "Users" does not exist', executedQuery,
    }));
    await renderPage();

    fireEvent.change(await screen.findByLabelText('Query'), { target: { value: 'select * from Users' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('The query failed')).toBeTruthy();
    expect(screen.getByText('select * from "Users"')).toBeTruthy();

    executedQuery = undefined;
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(screen.queryByText('Ran as:')).toBeNull());
  });
});

describe('data explorer messages', () => {
  it('translate every English text in the 10 other languages', () => {
    const en = Object.keys(messages.dataExplorer.en);
    const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '');
    for (const { code } of LOCALES.filter((l) => l.code !== 'en')) {
      const own = messages.dataExplorer[code as Exclude<typeof code, 'en'>] ?? {};
      const missing = en.filter((key) => !(key in own) && !(base(key) !== key && `${base(key)}_other` in own));
      expect({ code, missing }).toEqual({ code, missing: [] });
    }
  });
});
