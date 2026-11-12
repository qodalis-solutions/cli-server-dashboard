/**
 * Link requests: a terminal (`server add` in the web CLI) asks to be linked and the user approves it
 * here. These calls never redirect to the dashboard's sign-in: any user of the server may approve,
 * not only dashboard admins.
 */

/** A pending link request, as the approval page shows it. */
export interface LinkRequestView {
  userCode: string;
  client: string;
  origin: string | null;
  remoteAddress: string | null;
  /** Null: the terminal asks for all the approver's permissions. */
  permissions: string[] | null;
  createdAt: number;
  expiresAt: number;
}

export type LinkLookup =
  | { kind: 'found'; request: LinkRequestView }
  | { kind: 'unauthorized' }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string };

const BASE = '/api/v1/qcli/link/code';

function auth(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function errorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

/** `XXXX-XXXX` from what a user typed (case, spaces and dashes ignored); null when it cannot be a code. */
export function normalizeCode(value: string): string | null {
  const code = value.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z0-9]{8}$/.test(code) ? `${code.slice(0, 4)}-${code.slice(4)}` : null;
}

export async function fetchLinkRequest(code: string, token: string | null): Promise<LinkLookup> {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(code)}`, { headers: { Accept: 'application/json', ...auth(token) } });
    if (res.status === 401 || res.status === 403) return { kind: 'unauthorized' };
    if (res.status === 404) return { kind: 'notFound' };
    if (!res.ok) return { kind: 'error', message: await errorText(res) };
    return { kind: 'found', request: (await res.json()) as LinkRequestView };
  } catch (err) {
    return { kind: 'error', message: (err as Error).message };
  }
}

/** Approve or deny; resolves with null on success, otherwise the server's message (404: expired). */
export async function decideLink(code: string, decision: 'approve' | 'deny', token: string | null): Promise<{ status: number; error: string } | null> {
  const res = await fetch(`${BASE}/${encodeURIComponent(code)}/${decision}`, { method: 'POST', headers: auth(token) });
  return res.ok ? null : { status: res.status, error: await errorText(res) };
}

/** Signs in with the users plugin (any user, not only dashboard admins); the session token, or null. */
export async function signInForLink(username: string, password: string): Promise<string | null> {
  const res = await fetch('/api/v1/qcli/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { token?: string };
  return body.token ?? null;
}
