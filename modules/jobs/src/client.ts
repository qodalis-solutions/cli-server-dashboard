import { ApiError, responseErrorText, type DashboardExtensionContext } from '@qodalis/cli-server-dashboard-kit';

type Fetch = DashboardExtensionContext['fetch'];

/** Plain fetch with JSON bodies, until the dashboard's is bound (tests stub the global fetch). */
const plainFetch: Fetch = (path, init = {}) => {
  const headers = new Headers(init.headers);
  if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(path, { ...init, headers });
};

let fetcher: Fetch = plainFetch;

/**
 * Sends the module's requests through the dashboard's `fetch` (its token, its sign-out on 401). Bound by the page,
 * the Overview cards and the palette with the context they get.
 */
export function bindFetch(next: Fetch): void {
  fetcher = next;
}

/** A JSON request: the parsed body (undefined when empty), {@link ApiError} with the server's `error` otherwise. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetcher(path, init);
  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, responseErrorText(res.status, res.statusText, text), parsed);
  }
  return parsed as T;
}

export { ApiError };
