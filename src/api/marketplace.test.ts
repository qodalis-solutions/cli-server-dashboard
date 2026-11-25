// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
import { ConfigValidationError } from './config';
import {
  getInstalledPluginConfig,
  getMarketplaceInfo,
  getMarketplaceInstalled,
  getMarketplacePlugin,
  installMarketplacePlugin,
  marketplaceErrorKind,
  pluginSettingsPath,
  readPluginConfig,
  readPluginItem,
  removeMarketplacePlugin,
  searchMarketplace,
  updateMarketplacePlugin,
  versionConfig,
} from './marketplace';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let answer: (url: string, init?: RequestInit) => Response;
const calls: Array<{ url: string; method: string; body?: string }> = [];

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body as string | undefined });
    return answer(String(input), init);
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('marketplace settings', () => {
  it('reads the install policy and the dashboard API', async () => {
    answer = () => json({ marketplaceUrl: 'https://plugins.qodalis.com', install: 'off', dashboardApi: 2 });
    expect(await getMarketplaceInfo()).toEqual({ marketplaceUrl: 'https://plugins.qodalis.com', install: 'off', dashboardApi: 2 });
    expect(calls[0].url).toBe('/api/v1/qcli/dashboard/marketplace');
  });

  it("defaults to verified publishers and API 1 when the server leaves them out", async () => {
    answer = () => json({ marketplaceUrl: 'x', install: 'whatever' });
    expect(await getMarketplaceInfo()).toEqual({ marketplaceUrl: 'x', install: 'verified', dashboardApi: 1 });
  });

  it('is null on servers without the marketplace', async () => {
    answer = () => json({ error: 'Not found' }, 404);
    expect(await getMarketplaceInfo()).toBeNull();
    answer = () => new Response('', { status: 405 });
    expect(await getMarketplaceInfo()).toBeNull();
  });

  it('rejects other failures', async () => {
    answer = () => json({ error: 'boom' }, 500);
    await expect(getMarketplaceInfo()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('searching the marketplace', () => {
  it('asks for a page with the query and reads the annotated items', async () => {
    answer = () => json({
      items: [{
        name: '@qodalis/cli-dashboard-module-jobs', title: 'Jobs', description: 'Background jobs', icon: '⏱',
        publisher: { id: 'qodalis', name: 'Qodalis', verified: true }, latest: '1.2.0',
        installed: { version: '1.1.0' }, updateAvailable: true, allowed: true,
        requires: { serverPackage: '@qodalis/cli-server-plugin-jobs', installed: false },
      }],
      total: 41, page: 2, pageSize: 20,
    });
    const page = await searchMarketplace({ query: ' jobs ', page: 2, pageSize: 20 });
    expect(calls[0].url).toBe('/api/v1/qcli/dashboard/marketplace/plugins?page=2&pageSize=20&query=jobs');
    expect(page.total).toBe(41);
    expect(page.items[0]).toEqual({
      name: '@qodalis/cli-dashboard-module-jobs', title: 'Jobs', description: 'Background jobs', icon: '⏱',
      publisher: { name: 'Qodalis', verified: true }, latest: '1.2.0', installed: { version: '1.1.0' },
      updateAvailable: true, allowed: true, requires: { serverPackage: '@qodalis/cli-server-plugin-jobs', installed: false },
    });
  });

  it('leaves the query out when empty', async () => {
    answer = () => json({ items: [], total: 0, page: 1, pageSize: 20 });
    await searchMarketplace();
    expect(calls[0].url).toBe('/api/v1/qcli/dashboard/marketplace/plugins?page=1&pageSize=20');
  });

  it('reads missing fields safely: not installed, not allowed, the short name as title', () => {
    expect(readPluginItem({ name: '@acme/x', shortName: 'x', version: '0.1.0', blockedReason: 'unverified publisher' })).toEqual({
      name: '@acme/x', title: 'x', description: '', publisher: { name: '', verified: false }, latest: '0.1.0',
      installed: null, updateAvailable: false, allowed: false, blockedReason: 'unverified publisher', requires: null,
    });
  });

  it('copes with a body without items', async () => {
    answer = () => json({});
    expect(await searchMarketplace()).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });
});

describe('plugin details', () => {
  it('reads versions with their files and the server packages (object or list)', async () => {
    answer = () => json({
      name: '@acme/x', title: 'X', publisher: { name: 'Acme', verified: false }, latest: '2.0.0', readme: '# X',
      versions: [
        { version: '2.0.0', dashboardApi: 1, files: [{ path: 'dist/extension.js', integrity: 'sha384-a', size: 2048 }, { path: 'dist/extension.css' }] },
        { version: '1.0.0', files: [], deprecated: 'old' },
        { nope: true },
      ],
      serverPackages: { node: '@acme/server-x', dotnet: 'Acme.X', python: '' },
      license: 'MIT',
    });
    const details = await getMarketplacePlugin('@acme/x');
    expect(calls[0].url).toBe('/api/v1/qcli/dashboard/marketplace/plugins/%40acme%2Fx');
    expect(details.versions).toEqual([
      { version: '2.0.0', dashboardApi: 1, files: [{ path: 'dist/extension.js', integrity: 'sha384-a', size: 2048 }, { path: 'dist/extension.css' }] },
      { version: '1.0.0', files: [], deprecated: 'old' },
    ]);
    expect(details.serverPackages).toEqual([{ platform: 'node', name: '@acme/server-x' }, { platform: 'dotnet', name: 'Acme.X' }]);
    expect(details.readme).toBe('# X');
    expect(details.license).toBe('MIT');

    answer = () => json({ name: '@acme/x', serverPackages: [{ ecosystem: 'npm', name: '@acme/server-x', install: 'npm i' }] });
    expect((await getMarketplacePlugin('@acme/x')).serverPackages).toEqual([{ platform: 'npm', name: '@acme/server-x' }]);
  });
});

describe('installed marketplace plugins', () => {
  it('reads the list', async () => {
    answer = () => json([
      { name: '@acme/x', version: '1.0.0', title: 'X', icon: '🗂️', id: 'x', installedAt: '2026-11-25T10:00:00Z', installedBy: 'root', updateAvailable: true },
      { name: '@acme/y', version: '0.1.0', id: 'y' },
      { broken: true },
    ]);
    expect(await getMarketplaceInstalled()).toEqual([
      { name: '@acme/x', version: '1.0.0', title: 'X', icon: '🗂️', id: 'x', installedAt: '2026-11-25T10:00:00Z', installedBy: 'root', updateAvailable: true },
      { name: '@acme/y', version: '0.1.0', title: '@acme/y', id: 'y' },
    ]);
  });

  it('is empty on servers without the marketplace', async () => {
    answer = () => json({ error: 'Not found' }, 404);
    expect(await getMarketplaceInstalled()).toEqual([]);
  });

  it('installs, updates and removes', async () => {
    answer = () => json({ name: '@acme/x', version: '1.0.0' }, 201);
    await installMarketplacePlugin('@acme/x');
    await installMarketplacePlugin('@acme/x', { version: '0.9.0' });
    await updateMarketplacePlugin('@acme/x');
    answer = () => new Response(null, { status: 204 });
    await removeMarketplacePlugin('@acme/x');
    expect(calls).toEqual([
      { url: '/api/v1/qcli/dashboard/marketplace/installed', method: 'POST', body: '{"name":"@acme/x"}' },
      { url: '/api/v1/qcli/dashboard/marketplace/installed', method: 'POST', body: '{"name":"@acme/x","version":"0.9.0"}' },
      { url: '/api/v1/qcli/dashboard/marketplace/installed/%40acme%2Fx', method: 'PUT', body: '{}' },
      { url: '/api/v1/qcli/dashboard/marketplace/installed/%40acme%2Fx', method: 'DELETE', body: undefined },
    ]);
  });
});

describe('marketplace plugin settings', () => {
  const ENTRIES = [
    { key: 'refreshSeconds', label: 'Refresh every', description: 'Seconds', type: 'number', default: 30, validation: { min: 5, max: 3600 } },
    { key: 'columns', type: 'string[]', default: ['name', 'status'] },
    { key: 'mode', type: 'enum', default: 'compact', validation: { options: ['compact', 'full'], extra: 1 } },
  ];

  it('reads the entries, dropping keyless ones, unknown types (a secret) and unknown rules', () => {
    expect(readPluginConfig({ entries: [...ENTRIES, { type: 'string', default: '' }, { key: 'token', type: 'secret', default: '' }, 'x'] })).toEqual({
      entries: [
        ENTRIES[0],
        { key: 'columns', type: 'string[]', default: ['name', 'status'] },
        { key: 'mode', type: 'enum', default: 'compact', validation: { options: ['compact', 'full'] } },
      ],
    });
    expect(readPluginConfig({ entries: [] })).toBeUndefined();
    expect(readPluginConfig(null)).toBeUndefined();
    expect(readPluginConfig({ entries: [{ key: 'x', type: 'string' }] })).toEqual({ entries: [{ key: 'x', type: 'string', default: null }] });
  });

  it("reads them on the details and each version, and picks a version's", async () => {
    answer = () => json({
      name: '@acme/x', latest: '2.0.0', config: { entries: [ENTRIES[1]] },
      versions: [{ version: '2.0.0', files: [] }, { version: '1.0.0', files: [], config: { entries: [ENTRIES[0]] } }, { version: '0.1.0', files: [] }],
    });
    const details = await getMarketplacePlugin('@acme/x');
    expect(details.config?.entries.map(e => e.key)).toEqual(['columns']);
    expect(details.versions[1].config?.entries.map(e => e.key)).toEqual(['refreshSeconds']);
    expect(details.versions[0].config).toBeUndefined();
    // The latest version without its own falls back to the plugin's; an older one without settings has none
    expect(versionConfig(details).map(e => e.key)).toEqual(['columns']);
    expect(versionConfig(details, '1.0.0').map(e => e.key)).toEqual(['refreshSeconds']);
    expect(versionConfig(details, '0.1.0')).toEqual([]);
  });

  it('sends config with install and update only when there is some, and reads configDropped', async () => {
    answer = () => json({ name: '@acme/x', version: '2.0.0', configDropped: ['mode', 3] });
    await installMarketplacePlugin('@acme/x', { config: { refreshSeconds: 60 } });
    await installMarketplacePlugin('@acme/x', { config: {} });
    const updated = await updateMarketplacePlugin('@acme/x', { version: '2.0.0', config: { mode: 'full' } });
    expect(updated.configDropped).toEqual(['mode']);
    expect(calls.map(c => c.body)).toEqual([
      '{"name":"@acme/x","config":{"refreshSeconds":60}}',
      '{"name":"@acme/x"}',
      '{"version":"2.0.0","config":{"mode":"full"}}',
    ]);
    answer = () => json({ name: '@acme/x' });
    expect((await updateMarketplacePlugin('@acme/x')).configDropped).toEqual([]);
  });

  it("rejects with the per-key errors of a 400, and other failures as they are", async () => {
    answer = () => json({ error: 'validation failed', errors: { refreshSeconds: 'must be at least 5', bad: 1 } }, 400);
    const err = await installMarketplacePlugin('@acme/x', { config: { refreshSeconds: 1 } }).catch(e => e);
    expect(err).toBeInstanceOf(ConfigValidationError);
    expect(err.errors).toEqual({ refreshSeconds: 'must be at least 5' });

    answer = () => json({ error: 'invalid package name' }, 400);
    const plain = await updateMarketplacePlugin('@acme/x', { config: { a: 1 } }).catch(e => e);
    expect(plain).toBeInstanceOf(ApiError);
    expect(plain.status).toBe(400);
  });

  it("reads an installed plugin's values", async () => {
    answer = () => json({ values: { refreshSeconds: 60 }, version: 'v3' });
    expect(await getInstalledPluginConfig('@acme/x')).toEqual({ values: { refreshSeconds: 60 }, version: 'v3' });
    expect(calls[0].url).toBe('/api/v1/qcli/dashboard/marketplace/installed/%40acme%2Fx/config');
    answer = () => json({});
    expect(await getInstalledPluginConfig('@acme/x')).toEqual({ values: {}, version: null });
  });

  it('links to the settings on the Config page', () => {
    expect(pluginSettingsPath('kanban')).toBe('/config?provider=dashboard-plugins&section=kanban');
  });
});

describe('marketplace errors', () => {
  it.each([
    [new ApiError('{"error":"marketplace unreachable"}', 502), 'unreachable'],
    [new ApiError('Bad Gateway', 504), 'unreachable'],
    [new ApiError('{"error":"integrity mismatch for dist/extension.js"}', 502), 'integrity'],
    [new ApiError('{"error":"publisher not verified"}', 403), 'unverified'],
    [new ApiError('{"error":"forbidden"}', 403), 'forbidden'],
    [new ApiError('{"error":"extension id jobs is taken"}', 409), 'clash'],
    [new ApiError('{"error":"boom"}', 500), 'other'],
    [new Error('marketplace unreachable'), 'unreachable'],
    [new Error('Failed to fetch'), 'other'],
  ])('%s is %s', (err, kind) => {
    expect(marketplaceErrorKind(err)).toBe(kind);
  });
});
