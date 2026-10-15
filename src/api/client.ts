const TOKEN_KEY = 'qcli_admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Login page URL, under the app's base path (vite `base`). */
export const LOGIN_URL = `${import.meta.env.BASE_URL}login`;

export interface ApiFetchOptions extends RequestInit {
  /**
   * Unauthenticated request (e.g. login): the stored token is not sent, and a 401
   * is an error for the caller instead of a redirect to sign-in.
   */
  anonymous?: boolean;
}

export async function apiFetch<T>(
  path: string,
  { anonymous = false, ...options }: ApiFetchOptions = {},
): Promise<T> {
  const token = anonymous ? null : getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Don't set Content-Type for FormData (file uploads)
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const res = await fetch(path, { ...options, headers });

  // A 401 for a request that carried a token means the session ended: back to sign-in.
  // Without a token (anonymous requests, e.g. wrong credentials on login) the error goes to the caller.
  if (res.status === 401 && token) {
    clearToken();
    if (window.location.pathname !== LOGIN_URL) window.location.href = LOGIN_URL;
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || res.statusText);
  }

  // 204 / empty bodies (mkdir, rm, toggles)
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/**
 * WebSocket URL for a server socket path (e.g. `/ws/v1/qcli/events`).
 *
 * Protected servers (users plugin) accept a single-use ticket and reject bearer
 * tokens in URLs; servers without the users plugin have no ticket endpoint and
 * keep accepting the legacy `token` query parameter.
 */
export async function buildWebSocketUrl(path: string): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${proto}//${window.location.host}${path}`;
  const sep = path.includes('?') ? '&' : '?';
  try {
    const res = await fetch('/api/v1/qcli/sessions/ws-ticket', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.ok) {
      const { ticket } = (await res.json()) as { ticket?: unknown };
      if (typeof ticket === 'string') return `${base}${sep}ticket=${encodeURIComponent(ticket)}`;
    }
    if (res.status === 401) return null; // session gone: the next API call redirects to login
  } catch {
    // network error: fall through to the legacy form
  }
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}
