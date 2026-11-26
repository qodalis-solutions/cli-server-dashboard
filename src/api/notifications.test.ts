// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  badgeText,
  dismissNotification,
  getNotifications,
  isExternalLink,
  isSafeLink,
  markAllNotificationsRead,
  markNotificationRead,
  readNotificationList,
} from './notifications';
import { checkUpdates, getUpdates, readUpdates } from './updates';
import { ApiError, setToken } from './client';
import { json } from '../test/fakes';
import { messages } from '../i18n/messages';
import { LOCALES } from '../i18n/locales';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  setToken('t');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const item = (over: Record<string, unknown> = {}) => ({
  id: 'n_1', key: 'update:server:weather', kind: 'update', severity: 'warning', title: 'Update available', message: 'm',
  link: '/plugins?tab=updates', createdAt: '2026-11-26T10:00:00Z', updatedAt: '2026-11-26T11:00:00Z', read: false, ...over,
});

describe('notifications API', () => {
  it('reads the list, dropping malformed items and unsafe links', () => {
    const list = readNotificationList({
      items: [item(), { id: '' }, null, item({ id: 'n_2', severity: 'fatal', link: 'javascript:alert(1)', read: true })],
      unreadCount: 3,
    });
    expect(list.unreadCount).toBe(3);
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toEqual(item());
    expect(list.items[1]).toMatchObject({ id: 'n_2', severity: 'info', read: true });
    expect(list.items[1].link).toBeUndefined();
    // a body without a count: counted from the items
    expect(readNotificationList({ items: [item()] }).unreadCount).toBe(1);
    expect(readNotificationList([])).toEqual({ items: [], unreadCount: 0 });
  });

  it('links: dashboard paths and http(s) URLs only', () => {
    expect(isSafeLink('/plugins')).toBe(true);
    expect(isSafeLink('https://example.test')).toBe(true);
    expect(isSafeLink('//evil.test')).toBe(false);
    expect(isSafeLink('javascript:x')).toBe(false);
    expect(isExternalLink('https://example.test')).toBe(true);
    expect(isExternalLink('/plugins')).toBe(false);
  });

  it('sends the filters; null on a server without notifications', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [item()], unreadCount: 1 }));
    expect((await getNotifications({ unread: true, severity: 'error', limit: 8 }))?.items).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/qcli/notifications?unread=true&severity=error&limit=8');
    fetchMock.mockResolvedValueOnce(json({ error: 'not found' }, 404));
    expect(await getNotifications()).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/qcli/notifications');
    fetchMock.mockResolvedValueOnce(json({ error: 'boom' }, 500));
    await expect(getNotifications()).rejects.toBeInstanceOf(ApiError);
  });

  it('reads, reads all, dismisses and clears for everyone', async () => {
    fetchMock.mockImplementation(async () => json({ unreadCount: 2 }));
    expect(await markNotificationRead('n 1')).toBe(2);
    expect(await markAllNotificationsRead()).toBe(2);
    expect(await dismissNotification('n_1')).toBe(2);
    expect(await dismissNotification('n_1', true)).toBe(2);
    expect(fetchMock.mock.calls.map(([url, init]) => [init.method, url])).toEqual([
      ['POST', '/api/v1/qcli/notifications/n%201/read'],
      ['POST', '/api/v1/qcli/notifications/read-all'],
      ['DELETE', '/api/v1/qcli/notifications/n_1'],
      ['DELETE', '/api/v1/qcli/notifications/n_1?scope=all'],
    ]);
  });

  it('badge text', () => {
    expect(badgeText(3)).toBe('3');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
  });
});

describe('updates API', () => {
  const update = (over: Record<string, unknown> = {}) => ({
    kind: 'server', name: 'weather', package: '@qodalis/cli-server-plugin-weather', title: 'Weather', icon: '🌤️',
    current: '1.0.0', latest: '1.2.0', source: 'marketplace', updateAvailable: true, canUpdate: true, ...over,
  });

  it('reads the result, dropping malformed items, and counts when the server does not', () => {
    const result = readUpdates({
      checkedAt: '2026-11-26T10:00:00Z',
      checking: false,
      error: 'server package: npm registry unreachable',
      server: { kind: 'core', name: '@qodalis/cli-server-node', current: '1.0.0', latest: '1.1.0', source: 'npm', updateAvailable: true, install: { node: 'npm install x', bad: 1 } },
      dashboardPlugins: [update({ kind: 'dashboard', name: '@acme/tickets' }), { name: 'x', kind: 'weird' }],
      serverPlugins: [update()],
      codePlugins: [update({ source: 'code', canUpdate: false, reason: 'update in code', install: { node: 'npm install y', python: 'pip install y' } })],
    })!;
    expect(result.count).toBe(4);
    expect(result.error).toBe('server package: npm registry unreachable');
    expect(result.server).toMatchObject({ kind: 'core', install: { node: 'npm install x' }, canUpdate: false });
    expect(result.dashboardPlugins.map(i => i.name)).toEqual(['@acme/tickets']);
    expect(result.codePlugins[0]).toMatchObject({ source: 'code', reason: 'update in code', install: { node: 'npm install y', python: 'pip install y' } });
    expect(readUpdates({ checkedAt: null, dashboardPlugins: [], serverPlugins: [], codePlugins: [], server: null, count: 0 })).toMatchObject({ checkedAt: null, count: 0 });
    expect(readUpdates([])).toBeNull();
  });

  it('null on servers without it or for users who may not see it; Check now posts', async () => {
    for (const status of [403, 404, 405]) {
      fetchMock.mockResolvedValueOnce(json({ error: 'x' }, status));
      expect(await getUpdates()).toBeNull();
    }
    fetchMock.mockResolvedValueOnce(json({ checkedAt: 'now', dashboardPlugins: [], serverPlugins: [], codePlugins: [], server: null, count: 0 }));
    expect(await checkUpdates()).toMatchObject({ checkedAt: 'now' });
    expect(fetchMock.mock.calls.at(-1)).toEqual(['/api/v1/qcli/updates/check', expect.objectContaining({ method: 'POST' })]);
  });
});

describe('translations', () => {
  it.each(['notifications', 'updates'] as const)('%s: every language has every key (plural forms as the language needs)', namespace => {
    const ns = messages[namespace] as Record<string, Record<string, string>>;
    const base = Object.keys(ns.en).map(k => k.replace(/_(one|other)$/, '')).filter((k, i, all) => all.indexOf(k) === i);
    for (const { code } of LOCALES) {
      const table = ns[code];
      expect(table, code).toBeDefined();
      for (const key of base) {
        const plural = `${key}_other` in ns.en;
        expect(plural ? `${key}_other` in table : key in table, `${code}.${key}`).toBe(true);
      }
    }
  });
});
