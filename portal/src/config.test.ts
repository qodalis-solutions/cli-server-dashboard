// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { basePath, loadPortalConfig } from './config';
import { PORTAL_CONFIG, installPortalFetch, json, setBase } from './test/fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
  setBase('/');
});

describe('loadPortalConfig', () => {
  it('loads portal.json relative to the base', async () => {
    setBase('/developers/');
    const fetchMock = installPortalFetch();

    const config = await loadPortalConfig();

    expect(fetchMock.mock.calls[0][0]).toBe('/developers/portal.json');
    expect(config.name).toBe('RateBell API');
    expect(config.docs).toEqual(PORTAL_CONFIG.docs);
    expect(config.api).toEqual(PORTAL_CONFIG.api);
  });

  it('basePath of a root mount is "/"', () => {
    setBase('/');
    expect(basePath()).toBe('/');
    setBase('/developers/');
    expect(basePath()).toBe('/developers');
  });

  it('a failed portal.json shows the error state', async () => {
    installPortalFetch({ config: 'error' });
    await expect(loadPortalConfig()).rejects.toThrow(new Error('portal.json: 500'));
  });

  it('fills what an older or partial portal.json leaves out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ name: 'X', docs: null })));

    const config = await loadPortalConfig();

    expect(config).toEqual({
      name: 'X',
      logo: null,
      theme: { mode: 'system', dark: {}, light: {} },
      footerLinks: [],
      docs: null,
      api: null,
    });
  });

  it('drops footer links and a logo with unsafe urls', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      name: 'X',
      logo: 'javascript:alert(1)',
      footerLinks: [{ label: 'Bad', url: 'javascript:alert(1)' }, { label: 'Good', url: 'https://example.com' }],
    })));

    const config = await loadPortalConfig();

    expect(config.logo).toBeNull();
    expect(config.footerLinks).toEqual([{ label: 'Good', url: 'https://example.com' }]);
  });
});
