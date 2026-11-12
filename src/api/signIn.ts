import { setToken } from './client';

/**
 * How the server signs dashboard users in: `password` (this dashboard's own form) or
 * `external` (the host application signs users in and hands its token over in the URL
 * fragment, see {@link consumeFragmentToken}).
 */
export interface AuthMode {
  mode: 'password' | 'external';
  /** The host application's sign-in page (absolute http(s) URL or root-relative path), if configured. */
  signInUrl: string | null;
}

export const AUTH_MODE_URL = '/api/v1/qcli/auth/mode';

/** Servers without `/auth/mode` (older versions) only have the password form. */
export const PASSWORD_MODE: AuthMode = { mode: 'password', signInUrl: null };

/**
 * An absolute `http(s)` URL or a root-relative path (`/sign-in`, not `//host`). Anything else
 * (e.g. `javascript:`) is never used as a link, whatever the server sends.
 */
export function isSafeSignInUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || /\s/.test(value)) return false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false; // control characters
  }
  if (value.startsWith('/')) return value.length === 1 || (value[1] !== '/' && value[1] !== '\\');
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Normalises a `/auth/mode` body (or a 501 login error body) into an {@link AuthMode}. */
export function toAuthMode(body: unknown): AuthMode {
  if (!body || typeof body !== 'object') return PASSWORD_MODE;
  const { mode, signInUrl } = body as { mode?: unknown; signInUrl?: unknown };
  if (mode !== 'external') return PASSWORD_MODE;
  return { mode: 'external', signInUrl: isSafeSignInUrl(signInUrl) ? signInUrl : null };
}

/**
 * `GET /api/v1/qcli/auth/mode` (public). A 404, any other error status, a network error or
 * an unreadable body means an older server: password sign-in.
 */
export async function fetchAuthMode(): Promise<AuthMode> {
  try {
    const res = await fetch(AUTH_MODE_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) return PASSWORD_MODE;
    return toAuthMode(await res.json());
  } catch {
    return PASSWORD_MODE;
  }
}

/**
 * Host handoff: the host application opens `/qcli/admin/#token=<bearer token>`. A fragment never
 * reaches servers or their logs. Stores the token as the dashboard's admin token and removes it
 * from the address bar (and history) so it can't be copied or bookmarked. Other fragment
 * parameters are kept. Returns true when a token was taken.
 */
export function consumeFragmentToken(): boolean {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return false;

  const params = new URLSearchParams(hash.slice(1));
  const token = params.get('token');
  if (!params.has('token')) return false;

  params.delete('token');
  const rest = params.toString();
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, '', `${pathname}${search}${rest ? `#${rest}` : ''}`);

  if (!token) return false;
  setToken(token);
  return true;
}

/** The page the user is on, without its fragment: where the host's sign-in sends the user back. */
export function currentDashboardUrl(): string {
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}`;
}

const RETURN_TO_PLACEHOLDER = /\{returnTo\}|%7BreturnTo%7D/gi;

/**
 * The host's sign-in link for this page: `{returnTo}` in the server's `signInUrl` becomes the URL-encoded current
 * dashboard URL, or `returnTo=<encoded>` is added to its query when it has no placeholder. The host signs the user in
 * and returns to that URL with `#token=<session token>` (see {@link consumeFragmentToken}).
 */
export function signInHref(signInUrl: string, returnTo: string = currentDashboardUrl()): string {
  const encoded = encodeURIComponent(returnTo);
  const replaced = signInUrl.replace(RETURN_TO_PLACEHOLDER, encoded);
  if (replaced !== signInUrl) return replaced;
  const hashAt = signInUrl.indexOf('#');
  const base = hashAt === -1 ? signInUrl : signInUrl.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : signInUrl.slice(hashAt);
  const sep = !base.includes('?') ? '?' : base.endsWith('?') || base.endsWith('&') ? '' : '&';
  return `${base}${sep}returnTo=${encoded}${fragment}`;
}

const fragmentListeners = new Set<() => void>();

function onHashChange(): void {
  if (consumeFragmentToken()) fragmentListeners.forEach(listener => listener());
}

/**
 * Calls `listener` when a `#token=` handoff arrives while the page is open (the host changed only the fragment, so
 * the page did not reload); the token is already stored and removed from the URL then. Returns the unsubscribe.
 */
export function onFragmentToken(listener: () => void): () => void {
  if (fragmentListeners.size === 0) window.addEventListener('hashchange', onHashChange);
  fragmentListeners.add(listener);
  return () => {
    fragmentListeners.delete(listener);
    if (fragmentListeners.size === 0) window.removeEventListener('hashchange', onHashChange);
  };
}

/** The sign-in URL as shown to the user: without its query and fragment (where `{returnTo}` goes). */
export function signInLabel(signInUrl: string): string {
  return signInUrl.split(/[?#]/)[0] || signInUrl;
}
