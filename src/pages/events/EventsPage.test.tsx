// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import EventsPage from './EventsPage';
import { I18nProvider } from '../../i18n';
import { WebSocketProvider } from '../../context/WebSocketContext';
import { setToken } from '../../api/client';
import { FakeWebSocket, json } from '../../test/fakes';

const CLIENTS = [{ id: 'evt-1', type: 'events', connectedAt: '2026-11-25T10:00:00.000Z', remoteAddress: '10.0.0.7' }];
const last = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

/** Answers the clients list with `clients()`; everything else 404. */
function serveClients(clients: () => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
    String(input).split('?')[0] === '/api/v1/qcli/ws/clients' ? clients() : json({ error: 'not found' }, 404)));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('qcli_admin_locale', 'en');
  setToken('good-token');
  FakeWebSocket.install();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function mountEvents(path = '/events') {
  render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <WebSocketProvider><EventsPage /></WebSocketProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
  await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
  await act(async () => { last().open(); });
  return (event: Record<string, unknown>) => act(() => last().emit(event));
}

describe('EventsPage connected clients', () => {
  it('shows a table skeleton inside the panel until the clients arrive, then one table without its own card', async () => {
    let answer!: (r: Response) => void;
    serveClients(() => new Promise<Response>(r => { answer = r; }));
    await mountEvents();

    const skeleton = screen.getByRole('status');
    expect(skeleton.className).not.toContain('border-border');
    expect(skeleton.querySelectorAll(':scope > div')[1].children).toHaveLength(4);

    await act(async () => answer(json(CLIENTS)));
    expect(await screen.findByText('10.0.0.7')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    const frame = screen.getByRole('table').parentElement as HTMLElement;
    expect(frame.className).not.toContain('border');
  });

  it('shows a failed list with Retry instead of "no clients", and Retry loads it', async () => {
    let fail = true;
    serveClients(() => (fail ? json({ error: 'boom' }, 500) : json(CLIENTS)));
    await mountEvents();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('boom');
    expect(screen.queryByText('No clients connected.')).toBeNull();

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('10.0.0.7')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says "No clients connected." for an empty list', async () => {
    serveClients(() => json([]));
    await mountEvents();
    expect(await screen.findByText('No clients connected.')).toBeTruthy();
  });
});

describe('EventsPage live events', () => {
  it('waits for events, then lists them', async () => {
    serveClients(() => json([]));
    const emit = await mountEvents();
    expect(screen.getByText('Waiting for events…')).toBeTruthy();

    emit({ type: 'job:started', jobId: 'cleanup' });
    expect(screen.getByText('Job cleanup started')).toBeTruthy();
  });

  it('says how many events a filter hides (not "waiting"), and Clear shows them again', async () => {
    serveClients(() => json([]));
    const emit = await mountEvents('/events?q=nothing-matches');
    emit({ type: 'job:started', jobId: 'cleanup' });
    emit({ type: 'job:started', jobId: 'sync' });

    expect(screen.getByText('No events match the filter (2 hidden).')).toBeTruthy();
    expect(screen.queryByText('Waiting for events…')).toBeNull();

    const clear = screen.getAllByRole('button', { name: 'Clear' }).find(b => b.closest('.text-center'))!;
    fireEvent.click(clear);
    expect(screen.getByText('Job cleanup started')).toBeTruthy();
    expect(screen.queryByText(/No events match/)).toBeNull();
  });

  it('shows "Waiting for events…" again when the list is cleared', async () => {
    serveClients(() => json([]));
    const emit = await mountEvents();
    emit({ type: 'job:started', jobId: 'cleanup' });
    const clearList = screen.getAllByRole('button', { name: 'Clear' })[0];
    fireEvent.click(clearList);
    expect(screen.getByText('Waiting for events…')).toBeTruthy();
    expect(screen.queryByText('Job cleanup started')).toBeNull();
  });
});
