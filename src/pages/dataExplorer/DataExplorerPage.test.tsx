// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import DataExplorerPage from './DataExplorerPage';
import { I18nProvider } from '../../i18n';

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

function server(execute: (body: { source: string; query: string }) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/data-explorer/sources')) return json(SOURCES);
    if (url.includes('/data-explorer/schema')) {
      return json({ source: 'demo-sqlite', tables: [{ name: 'users', type: 'table', columns: [{ name: 'id', type: 'INTEGER', nullable: false, primaryKey: true }] }] });
    }
    if (url.endsWith('/data-explorer/execute')) return execute(JSON.parse(String(init?.body)));
    return json({ error: 'not found' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/data-explorer']}>
        <DataExplorerPage />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DataExplorerPage', () => {
  it('lists sources with their badges and runs a template', async () => {
    const queries: string[] = [];
    server(body => {
      queries.push(body.query);
      return json({ success: true, source: body.source, executionTime: 7, columns: ['name'], rows: [['users'], ['orders']], rowCount: 2, truncated: true, error: null });
    });
    renderPage();

    const nav = await screen.findByRole('navigation', { name: 'Sources' });
    expect(within(nav).getByText('demo-sqlite')).toBeTruthy();
    expect(within(nav).getByText('Read-only')).toBeTruthy();
    expect(within(nav).getByText('Export allowed')).toBeTruthy();
    expect(within(nav).getByText('Writes allowed')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Templates'), { target: { value: 'list_tables' } });
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
    renderPage();

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
    renderPage();

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
    renderPage();

    fireEvent.change(await screen.findByLabelText('Query'), { target: { value: 'SELECT 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(within(await screen.findByRole('alert')).getByText('Not allowed')).toBeTruthy();

    status = 429;
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Too many queries')).toBeTruthy();
  });

  it('keeps a query per source and browses the schema', async () => {
    server(() => json({}));
    renderPage();

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
    renderPage();

    fireEvent.change(await screen.findByLabelText('Query'), { target: { value: 'SELECT 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    fireEvent.click(screen.getByRole('button', { name: /^cache/ }));
    answer(json({ success: true, source: 'demo-sqlite', executionTime: 1, columns: ['n'], rows: [[1]], rowCount: 1, truncated: false, error: null }));

    expect(await screen.findByRole('button', { name: 'Run' })).toBeTruthy();
    expect(screen.queryByText('1 row')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^demo-sqlite/ }));
    expect(await screen.findByText('1 row')).toBeTruthy();
  });
});
