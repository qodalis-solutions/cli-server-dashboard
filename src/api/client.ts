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

/**
 * Page navigations the API layer triggers (kept on an object so tests can observe them).
 * A 401 always lands on the sign-in page, which shows the password form or, in external
 * mode, the host application's sign-in.
 */
export const navigation = {
  toSignIn(): void {
    if (window.location.pathname !== LOGIN_URL) window.location.href = LOGIN_URL;
  },
};

/** A request the server answered with an error status; the message is the response body. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiFetchOptions extends RequestInit {
  /**
   * Unauthenticated request (e.g. login): the stored token is not sent, and a 401
   * is an error for the caller instead of a redirect to sign-in.
   */
  anonymous?: boolean;
  /** A 401 is an error for the caller (e.g. checking for a session) instead of a redirect to sign-in. */
  quiet?: boolean;
}

export async function apiFetch<T>(
  path: string,
  { anonymous = false, quiet = false, ...options }: ApiFetchOptions = {},
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

  // A 401 means the session ended (or, in external mode, the host's session did): the stored
  // token is dropped and the user goes back to sign-in. Anonymous requests (wrong credentials
  // on login) and quiet session checks get the error instead of the redirect.
  if (res.status === 401 && !anonymous) {
    if (token) clearToken();
    if (!quiet) navigation.toSignIn();
    throw new ApiError('Unauthorized', 401);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(body || res.statusText, res.status);
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

/** The ticket could not be fetched (network error, server error): try the socket again later. */
export class WebSocketTicketUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebSocketTicketUnavailableError';
  }
}

/**
 * WebSocket URL for a server socket path (e.g. `/ws/v1/qcli/events`), or null when signed out or the session ended.
 *
 * Protected servers (users plugin) accept a single-use ticket and reject bearer tokens in URLs. Only a server without
 * a ticket endpoint (404/405: no users plugin) gets the legacy `token` query parameter: a server that is down or
 * failing throws {@link WebSocketTicketUnavailableError} instead, so the bearer token never ends up in a URL (and in
 * access logs) because of an outage.
 */
export async function buildWebSocketUrl(path: string): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${proto}//${window.location.host}${path}`;
  const sep = path.includes('?') ? '&' : '?';
  let res: Response;
  try {
    res = await fetch('/api/v1/qcli/sessions/ws-ticket', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch (err) {
    throw new WebSocketTicketUnavailableError(err instanceof Error ? err.message : String(err));
  }
  if (res.ok) {
    const { ticket } = (await res.json()) as { ticket?: unknown };
    if (typeof ticket === 'string') return `${base}${sep}ticket=${encodeURIComponent(ticket)}`;
    throw new WebSocketTicketUnavailableError('The ticket response has no ticket');
  }
  if (res.status === 401) return null; // session gone: the next API call redirects to login
  if (res.status === 404 || res.status === 405) return `${base}${sep}token=${encodeURIComponent(token)}`;
  throw new WebSocketTicketUnavailableError(`The ticket request failed (${res.status})`);
}
