import type { DashboardExtensionInfo } from '@qodalis/cli-server-dashboard-kit';
import { apiFetch, ApiError } from './client';

/**
 * The pages plugins add to the dashboard (`GET /api/v1/qcli/dashboard/extensions`, docs/extensions.md).
 * Servers before the endpoint answer 404: no extensions. Entries without an id, a title or an entry are dropped.
 */
export async function getDashboardExtensions(): Promise<DashboardExtensionInfo[]> {
  try {
    const res = await apiFetch<{ extensions?: unknown }>('/api/v1/qcli/dashboard/extensions', { quiet: true });
    const list = Array.isArray(res?.extensions) ? res.extensions : [];
    return list.filter(
      (e): e is DashboardExtensionInfo =>
        !!e && typeof e.id === 'string' && typeof e.title === 'string' && typeof e.entry === 'string',
    );
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) return [];
    throw err;
  }
}

/** Who is signed in, as an extension sees it. */
export interface ExtensionUser {
  id: string;
  name: string;
  email?: string;
}

/**
 * The signed-in user and the permissions they hold, wildcards included (`GET /api/v1/qcli/sessions/current`, users
 * plugin). Null when the server has no sessions (one admin account) or the request authenticates otherwise.
 */
export async function getCurrentSession(): Promise<{ user: ExtensionUser; permissions: string[] } | null> {
  try {
    const res = await apiFetch<{ user?: { id?: unknown; name?: unknown; email?: unknown }; permissions?: unknown }>(
      '/api/v1/qcli/sessions/current',
      { quiet: true },
    );
    if (!res?.user || typeof res.user.name !== 'string') return null;
    return {
      user: {
        id: typeof res.user.id === 'string' ? res.user.id : res.user.name,
        name: res.user.name,
        ...(typeof res.user.email === 'string' && res.user.email ? { email: res.user.email } : {}),
      },
      permissions: Array.isArray(res.permissions) ? res.permissions.filter((p): p is string => typeof p === 'string') : [],
    };
  } catch (err) {
    if (err instanceof ApiError && err.status !== 401) return null;
    throw err;
  }
}
