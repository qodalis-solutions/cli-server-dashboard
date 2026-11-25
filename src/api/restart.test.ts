// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRestartStatus, pendingOf, pendingSignature, restartServer, RestartNotSupportedError, serverResponds } from './restart';
import { ApiError, setToken } from './client';
import { json } from '../test/fakes';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  setToken('t');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const CORS = { id: 'config:server.cors.mode', source: 'config', description: 'CORS mode changed', since: '2026-11-25T10:00:00Z' };

describe('restart API', () => {
  it('reads the status, dropping malformed pending entries and unknown modes', async () => {
    fetchMock.mockResolvedValueOnce(json({
      supported: true, mode: 'exit', supervisor: 'docker', startedAt: '2026-11-25T09:00:00Z',
      pending: [CORS, { source: 'x' }, null, { id: 'plugin:x' }],
    }));
    expect(await getRestartStatus()).toEqual({
      supported: true, mode: 'exit', supervisor: 'docker', startedAt: '2026-11-25T09:00:00Z',
      pending: [CORS, { id: 'plugin:x', source: '', description: '', since: '' }],
    });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/qcli/server/restart');

    fetchMock.mockResolvedValueOnce(json({ supported: 'yes', mode: 'reboot', supervisor: 'init', pending: 'none' }));
    expect(await getRestartStatus()).toEqual({ supported: false, mode: null, supervisor: null, startedAt: null, pending: [] });
  });

  it('is null on servers without it or for users who may not read it, an error otherwise', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'not found' }, 404));
    expect(await getRestartStatus()).toBeNull();
    fetchMock.mockResolvedValueOnce(json({ error: 'forbidden' }, 403));
    expect(await getRestartStatus()).toBeNull();
    fetchMock.mockResolvedValueOnce(json({ error: 'boom' }, 500));
    await expect(getRestartStatus()).rejects.toBeInstanceOf(ApiError);
  });

  it('posts the restart with the trimmed reason, none when blank', async () => {
    fetchMock.mockResolvedValueOnce(json({ restarting: true }, 202));
    await restartServer('  apply CORS  ');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/qcli/server/restart');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ reason: 'apply CORS' }) });
    fetchMock.mockResolvedValueOnce(json({ restarting: true }, 202));
    await restartServer('   ');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ body: '{}' });
  });

  it('rejects a server that cannot restart itself with its reason', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'restart not supported: no supervisor detected; set restart.mode' }, 409));
    const err = await restartServer().catch(e => e);
    expect(err).toBeInstanceOf(RestartNotSupportedError);
    expect(err.message).toBe('restart not supported: no supervisor detected; set restart.mode');
    fetchMock.mockResolvedValueOnce(json({ error: 'forbidden' }, 403));
    await expect(restartServer()).rejects.toMatchObject({ status: 403 });
  });

  it('tells whether the server answers', async () => {
    fetchMock.mockResolvedValueOnce(json({ supportedVersions: [1] }));
    expect(await serverResponds()).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/qcli/versions');
    fetchMock.mockResolvedValueOnce(json({}, 502));
    expect(await serverResponds()).toBe(false);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await serverResponds()).toBe(false);
  });

  it('signs a pending list independently of its order', () => {
    const a = pendingOf([CORS, { id: 'plugin:x' }]);
    const b = pendingOf([{ id: 'plugin:x' }, CORS]);
    expect(pendingSignature(a)).toBe(pendingSignature(b));
    expect(pendingSignature(a)).not.toBe(pendingSignature([CORS]));
  });
});
