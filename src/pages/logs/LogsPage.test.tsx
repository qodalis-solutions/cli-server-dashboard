// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import LogsPage from './LogsPage';
import { I18nProvider } from '../../i18n';
import { WebSocketProvider } from '../../context/WebSocketContext';
import { setToken } from '../../api/client';
import { FakeWebSocket, installFakeServer, json } from '../../test/fakes';

const last = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

/** A server that filters (store `memory`, like the three servers' admin plugins) with these entries, newest first. */
function serveLogs(entries: unknown[]) {
  installFakeServer();
  const inner = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).split('?')[0] === '/api/v1/qcli/logs') {
      return json({ entries, total: entries.length, limit: 100, offset: 0, hasMore: false, store: 'memory', persistent: false, services: [] });
    }
    return inner(input, init);
  }));
}

/** A `log:entry` event as the servers broadcast it on the events socket. */
const entry = (message: string, level = 'INFO') =>
  ({ type: 'log:entry', timestamp: '2026-11-10T10:00:01.000Z', level, message, source: 'console' });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  setToken('good-token');
  FakeWebSocket.install();
  serveLogs([{ timestamp: '2026-11-10T10:00:00.000Z', level: 'INFO', message: 'server started', source: 'console' }]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Mounts the page under a connected events socket; returns a function that emits a server event. */
async function mountLogs(path = '/logs') {
  render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <WebSocketProvider><LogsPage /></WebSocketProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
  await screen.findByText('Log Output');
  await act(async () => { last().open(); });
  return (event: Record<string, unknown>) => act(() => last().emit(event));
}

describe('LogsPage live tail', () => {
  it('appends a log:entry event below the history without a reload', async () => {
    const emit = await mountLogs();

    emit(entry('client connected'));

    const shown = screen.getAllByText(/^(server started|client connected)$/).map(e => e.textContent);
    expect(shown).toEqual(['server started', 'client connected']);
  });

  it('keeps the live entries matching the filters and drops the others', async () => {
    const emit = await mountLogs('/logs?level=ERROR');

    emit(entry('all fine'));
    emit(entry('disk failed', 'ERROR'));

    expect(screen.queryByText('all fine')).toBeNull();
    expect(screen.getByText('disk failed')).toBeTruthy();
  });

  it('holds the live entries while paused and shows them on resume', async () => {
    const emit = await mountLogs();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    emit(entry('while paused'));
    expect(screen.queryByText('while paused')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Resume (1 new)' }));
    expect(screen.getByText('while paused')).toBeTruthy();
  });

  it('keeps the latest 1000 entries of the live tail', async () => {
    await mountLogs();

    act(() => { for (let i = 1; i <= 1005; i++) last().emit(entry(`live ${i}`)); });

    expect(screen.queryByText('server started')).toBeNull();
    expect(screen.queryByText('live 5')).toBeNull();
    expect(screen.getByText('live 6')).toBeTruthy();
    expect(screen.getByText('live 1005')).toBeTruthy();
  });
});

describe('LogsPage loading', () => {
  it('shows a skeleton of the viewer, then the entries', async () => {
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/logs']}>
          <WebSocketProvider><LogsPage /></WebSocketProvider>
        </MemoryRouter>
      </I18nProvider>,
    );
    expect(screen.getByRole('status').textContent).toBe('Loading logs…');
    expect(await screen.findByText('server started')).toBeTruthy();
    expect(screen.queryByText('Loading logs…')).toBeNull();
  });
});

describe('LogsPage errors and the volume chart', () => {
  const renderLogs = () => render(
    <I18nProvider>
      <MemoryRouter initialEntries={['/logs']}>
        <WebSocketProvider><LogsPage /></WebSocketProvider>
      </MemoryRouter>
    </I18nProvider>,
  );

  it('shows a failed first page with Retry, and Retry loads it', async () => {
    let fail = true;
    installFakeServer();
    const inner = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).split('?')[0] === '/api/v1/qcli/logs') {
        return fail ? json({ error: 'log store offline' }, 500)
          : json({ entries: [{ timestamp: '2026-11-10T10:00:00.000Z', level: 'INFO', message: 'back again' }], total: 1, hasMore: false });
      }
      return inner(input, init);
    }));
    renderLogs();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('log store offline');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('back again')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it("holds the volume chart's place while the histogram loads, and drops it on a server without one", async () => {
    let answerHistogram!: (r: Response) => void;
    const inner = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).split('?')[0] === '/api/v1/qcli/logs/histogram'
        ? new Promise<Response>(r => { answerHistogram = r; })
        : inner(input, init)));
    renderLogs();

    expect(await screen.findByText('server started')).toBeTruthy();
    await waitFor(() => expect(answerHistogram).toBeTypeOf('function'));
    const placeholder = screen.getByRole('status');
    expect(placeholder.textContent).toBe('Log volume');
    expect(placeholder.querySelector('[style*="height: 142px"]')).not.toBeNull();

    await act(async () => answerHistogram(json({ error: 'not found' }, 404)));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
