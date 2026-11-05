import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasUsersSession } from './terminalUsers';

describe('hasUsersSession', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the users plugin for the session of the dashboard token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await hasUsersSession('tok')).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/qcli/sessions/current', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
    }));
  });

  it('is false without the users plugin, without a token or when the server is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    expect(await hasUsersSession('tok')).toBe(false);
    expect(await hasUsersSession(null)).toBe(false);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await hasUsersSession('tok')).toBe(false);
  });
});
