import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { DashboardExtension, DashboardExtensionContext } from '@qodalis/cli-server-dashboard-kit';
import extension from './index';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Where the dashboard shows the module: links inside it start here. */
export const PAGE_URL = '/qcli/admin/x/jobs';

/**
 * The module mounted as the dashboard mounts it, on a fake server: `routes` answer by path (query left out), anything
 * else answers `[]` as the dashboard's fake server does. `requests` lists the paths asked for, `fetch` is the mock.
 */
export function createHarness(routes: Record<string, unknown> = {}) {
  const requests: string[] = [];
  const fetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>(async (path) => {
    const pathname = path.split('?')[0];
    requests.push(pathname);
    return pathname in routes ? json(routes[pathname]) : json([]);
  });
  let path = '/';
  const pathListeners = new Set<(p: string) => void>();
  const eventListeners = new Map<string, Set<(e: Record<string, unknown>) => void>>();
  let host: HTMLDivElement | null = null;
  let unmount: (() => void) | void;

  const context = (): DashboardExtensionContext => ({
    extension: { id: 'jobs', title: 'Jobs', entry: '/x.js' },
    apiBase: '',
    fetch: (p, init) => fetch(p, init),
    user: { id: '1', name: 'alice' },
    permissions: ['*'],
    hasPermission: () => true,
    theme: 'light',
    onThemeChange: () => () => {},
    language: 'en',
    onLanguageChange: () => () => {},
    get path() { return path; },
    navigate: (to) => {
      path = to;
      window.history.replaceState(null, '', `${PAGE_URL}${to === '/' ? '' : to}`);
      pathListeners.forEach((fn) => fn(to));
    },
    onPathChange: (fn) => {
      pathListeners.add(fn);
      return () => void pathListeners.delete(fn);
    },
    onServerEvent: (pattern, listener) => {
      const set = eventListeners.get(pattern) ?? new Set();
      set.add(listener);
      eventListeners.set(pattern, set);
      return () => void set.delete(listener);
    },
    notify: () => {},
    confirm: async () => true,
    dashboardVersion: 'test',
    apiVersion: 1,
  });

  return {
    requests,
    fetch,
    /** Mounts the page at `to` (below the module's page), unmounting a previous mount. */
    async open(to = '/') {
      this.close();
      path = to;
      window.history.replaceState(null, '', `${PAGE_URL}${to === '/' ? '' : to}`);
      host = document.createElement('div');
      document.body.appendChild(host);
      const target = host;
      await act(async () => {
        unmount = await (extension as DashboardExtension).mount(target, context());
      });
    },
    close() {
      if (host) {
        act(() => {
          if (typeof unmount === 'function') unmount();
        });
        host.remove();
        host = null;
      }
    },
    get path() { return path; },
    context,
  };
}
