// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildWebSocketUrl, setToken, WebSocketTicketUnavailableError } from './client';

const respond = (status: number, body?: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), { status }));

describe('buildWebSocketUrl', () => {
  beforeEach(() => setToken('secret-session-token'));
  afterEach(() => vi.restoreAllMocks());

  it('uses a single-use ticket', async () => {
    respond(200, { ticket: 't-1' });
    const url = await buildWebSocketUrl('/ws/v1/qcli/events');
    expect(url).toMatch(/\/ws\/v1\/qcli\/events\?ticket=t-1$/);
  });

  it('returns null when the session is gone', async () => {
    respond(401);
    expect(await buildWebSocketUrl('/ws/v1/qcli/events')).toBeNull();
  });

  it('sends the token in the URL only to a server without a ticket endpoint', async () => {
    respond(404);
    expect(await buildWebSocketUrl('/ws/v1/qcli/events')).toMatch(/\?token=secret-session-token$/);
  });

  it('never puts the token in the URL when the server is down or failing', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(buildWebSocketUrl('/ws/v1/qcli/events')).rejects.toBeInstanceOf(WebSocketTicketUnavailableError);
    vi.restoreAllMocks();
    for (const status of [500, 502, 503]) {
      respond(status);
      await expect(buildWebSocketUrl('/ws/v1/qcli/events')).rejects.toBeInstanceOf(WebSocketTicketUnavailableError);
      vi.restoreAllMocks();
    }
  });
});
