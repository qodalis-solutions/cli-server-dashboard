// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getConfig, getConfigOverview, getConfigProvider, updateConfigSection, ConfigConflictError, ConfigValidationError } from './config';
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

describe('config API', () => {
  it('lists the providers, none when the answer has no list', async () => {
    fetchMock.mockResolvedValueOnce(json({ providers: [{ id: 'server' }] }));
    expect(await getConfig()).toEqual([{ id: 'server' }]);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/qcli/config');
    fetchMock.mockResolvedValueOnce(json({}));
    expect(await getConfig()).toEqual([]);
  });

  it('reads the default store besides the providers, null when the server sends none or a malformed one', async () => {
    const file = { kind: 'file', title: 'JSON file', detail: 'c.json', persistent: true };
    fetchMock.mockResolvedValueOnce(json({ providers: [], defaultStore: file }));
    expect(await getConfigOverview()).toEqual({ providers: [], defaultStore: file });
    fetchMock.mockResolvedValueOnce(json({ providers: [{ id: 'server' }] }));
    expect(await getConfigOverview()).toEqual({ providers: [{ id: 'server' }], defaultStore: null });
    fetchMock.mockResolvedValueOnce(json({ providers: [], defaultStore: { kind: 'memory' } }));
    expect((await getConfigOverview()).defaultStore).toEqual({ kind: 'memory', title: '', detail: '', persistent: false });
    fetchMock.mockResolvedValueOnce(json({ providers: [], defaultStore: 'file' }));
    expect((await getConfigOverview()).defaultStore).toBeNull();
  });

  it('reads the single store of older servers as the default store, preferring defaultStore', async () => {
    const file = { kind: 'file', title: 'JSON file', detail: 'c.json', persistent: true };
    const memory = { kind: 'memory', title: 'In memory', detail: '', persistent: false };
    fetchMock.mockResolvedValueOnce(json({ providers: [], store: file }));
    expect((await getConfigOverview()).defaultStore).toEqual(file);
    fetchMock.mockResolvedValueOnce(json({ providers: [], defaultStore: memory, store: file }));
    expect((await getConfigOverview()).defaultStore).toEqual(memory);
  });

  it("reads each provider's own store, dropping a malformed one", async () => {
    const redis = { kind: 'redis', title: 'Redis', detail: 'localhost:6379, key qcli:config', persistent: true };
    fetchMock.mockResolvedValueOnce(json({ providers: [{ id: 'a', store: redis }, { id: 'b', store: 'db' }, { id: 'c' }] }));
    expect((await getConfigOverview()).providers).toEqual([{ id: 'a', store: redis }, { id: 'b' }, { id: 'c' }]);
  });

  it('reads one provider', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'a b' }));
    await getConfigProvider('a b');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/qcli/config/a%20b');
  });

  it('patches a section with the changes and the version', async () => {
    fetchMock.mockResolvedValueOnce(json({ provider: 'demo', applied: ['text'], requiresRestart: false, version: '2' }));
    const res = await updateConfigSection('demo', 'greeting', { text: 'Hi', apiKey: null }, '1');
    expect(res.version).toBe('2');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/qcli/config/demo/greeting');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ changes: { text: 'Hi', apiKey: null }, version: '1' });
  });

  it('sends no version when the section has none', async () => {
    fetchMock.mockResolvedValueOnce(json({ provider: 'demo', applied: [], requiresRestart: false, version: '1' }));
    await updateConfigSection('demo', 'greeting', { a: 1 }, null);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ changes: { a: 1 } });
  });

  it('turns 400 per-key errors into ConfigValidationError', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'validation failed', errors: { text: 'is required' } }, 400));
    const err = await updateConfigSection('demo', 'greeting', { text: '' }).catch(e => e);
    expect(err).toBeInstanceOf(ConfigValidationError);
    expect(err.errors).toEqual({ text: 'is required' });
  });

  it('keeps a plain 400 as ApiError', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'changes must be an object' }, 400));
    const err = await updateConfigSection('demo', 'greeting', {}).catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
  });

  it('turns 409 into ConfigConflictError with the current version', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'version conflict', version: '7' }, 409));
    const err = await updateConfigSection('demo', 'greeting', { text: 'x' }, '6').catch(e => e);
    expect(err).toBeInstanceOf(ConfigConflictError);
    expect(err.version).toBe('7');
  });

  it('keeps 403 and 404 as ApiError', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'forbidden' }, 403));
    expect((await updateConfigSection('a', 'b', {}).catch(e => e)).status).toBe(403);
    fetchMock.mockResolvedValueOnce(json({ error: 'not found' }, 404));
    expect((await updateConfigSection('a', 'b', {}).catch(e => e)).status).toBe(404);
  });
});
