/**
 * Test helpers for dashboard extensions (`@qodalis/cli-server-dashboard-kit/testing`): a fake dashboard context and
 * mounting into the document, for tests with @testing-library/react and a DOM (jsdom).
 */
import { act } from '@testing-library/react';
import type { DashboardExtension, DashboardExtensionContext } from './extension/types';

/** Answers the extension's requests in tests: a path and its init, as `context.fetch` gets them. */
export type FakeServer = (path: string, init?: RequestInit) => Response | Promise<Response>;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A dashboard for tests: its path (with the query), the requests the extension made, and its context. */
export function fakeDashboard(id: string, options: { server: FakeServer; path?: string; permissions?: string[]; language?: string }) {
  const state = {
    path: options.path ?? '/',
    requests: [] as Array<{ path: string; method: string; body?: unknown; quiet?: boolean }>,
    notices: [] as Array<{ message: string; kind?: string }>,
  };
  const pathListeners = new Set<(p: string) => void>();
  const permissions = options.permissions ?? ['*'];
  const context: DashboardExtensionContext = {
    extension: { id, title: id, entry: '/x.js' },
    apiBase: '',
    fetch: async (path, init) => {
      state.requests.push({
        path,
        method: init?.method ?? 'GET',
        ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
        ...(init?.quiet ? { quiet: true } : {}),
      });
      return options.server(path, init);
    },
    user: { id: '1', name: 'root' },
    permissions,
    hasPermission: p => permissions.includes('*') || permissions.includes(p),
    theme: 'light',
    onThemeChange: () => () => {},
    language: options.language ?? 'en',
    onLanguageChange: () => () => {},
    get path() { return state.path; },
    navigate: to => {
      state.path = to;
      pathListeners.forEach(fn => fn(to));
    },
    onPathChange: fn => {
      pathListeners.add(fn);
      return () => void pathListeners.delete(fn);
    },
    onServerEvent: () => () => {},
    notify: (message, kind) => void state.notices.push({ message, kind }),
    confirm: async () => true,
    dashboardVersion: 'test',
    apiVersion: 1,
  };
  return { state, context };
}

/** Mounts the extension into a new element of the document; returns the unmount. */
export async function mountExtension(extension: DashboardExtension, context: DashboardExtensionContext): Promise<() => void> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let cleanup: void | (() => void);
  await act(async () => {
    cleanup = await extension.mount(host, context);
  });
  return () => {
    act(() => {
      if (typeof cleanup === 'function') cleanup();
    });
    host.remove();
  };
}
