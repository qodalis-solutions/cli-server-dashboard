import { errorText } from '@qodalis/cli-server-dashboard-kit';
import { apiFetch, setToken, clearToken, getToken, LOGIN_URL } from './client';

export interface LoginResponse {
  token: string;
  expiresIn: number;
  username: string;
  /**
   * Users plugin: the password was set by an administrator (or is the default one) and must be changed before the
   * account can do anything else; every other request answers 403 until then.
   */
  mustChangePassword?: boolean;
}

export interface AuthUser {
  username: string;
  authenticatedAt: string;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await apiFetch<LoginResponse>('/api/v1/qcli/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    anonymous: true, // a stale stored token must neither be sent nor trigger the sign-in redirect
  });
  setToken(res.token);
  return res;
}

/** The signed-in user. `quiet`: a 401 rejects instead of sending the user to sign-in. */
export async function getMe({ quiet = false }: { quiet?: boolean } = {}): Promise<AuthUser> {
  return apiFetch<AuthUser>('/api/v1/qcli/auth/me', { quiet });
}

/**
 * Changes the signed-in user's own password (`PUT /api/v1/qcli/users/<name>/password`, users plugin): the only
 * request a session that must change its password may make. Other sessions of the user end; this one stays.
 */
export async function changeOwnPassword(username: string, currentPassword: string, password: string): Promise<void> {
  await apiFetch<void>(`/api/v1/qcli/users/${encodeURIComponent(username)}/password`, {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, password }),
    quiet: true,
  });
}

/** The server's reason from an error body (`{ "error": "…" }`), else the text as it came. */
export function serverMessage(err: unknown): string {
  // The JSON `{ error }`, an HTML error page reduced to its text (`HTTP 404 Not Found` when it has none)
  return errorText(err);
}

export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    // With the users plugin the token is a server session: end it there too.
    // Servers without it have no session endpoint; the token simply expires.
    await fetch('/api/v1/qcli/sessions/current', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
  clearToken();
  window.location.href = LOGIN_URL;
}
