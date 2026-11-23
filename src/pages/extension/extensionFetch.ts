import { clearToken, getToken, navigation } from '../../api/client';

/** The server's API base as extensions see it: the dashboard's own origin (its API URLs are root-relative). */
export const apiBase = (): string => window.location.origin;

/**
 * An extension's `fetch`: a path is resolved against the API base and sent with the dashboard's token and JSON
 * headers; absolute URLs elsewhere get no token. A 401 on a request that carried the token signs the user out, as
 * the dashboard's own requests do, unless the request is `quiet` (an optional one the user may not be allowed); the
 * response is returned either way.
 */
export async function extensionFetch(path: string, { quiet = false, ...init }: RequestInit & { quiet?: boolean } = {}): Promise<Response> {
  const base = apiBase();
  const url = /^https?:\/\//i.test(path) ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  const sameOrigin = new URL(url, base).origin === new URL(base).origin;
  const headers = new Headers(init.headers);
  const token = sameOrigin ? getToken() : null;
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && !quiet && token && headers.get('Authorization') === `Bearer ${token}`) {
    clearToken();
    navigation.toSignIn();
  }
  return res;
}
