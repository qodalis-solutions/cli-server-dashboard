import { apiFetch, setToken, clearToken, getToken } from './client';

export interface LoginResponse {
  token: string;
  expiresIn: number;
  username: string;
}

export interface AuthUser {
  username: string;
  authenticatedAt: string;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await apiFetch<LoginResponse>('/api/v1/qcli/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(res.token);
  return res;
}

export async function getMe(): Promise<AuthUser> {
  return apiFetch<AuthUser>('/api/v1/qcli/auth/me');
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
  window.location.href = '/qcli/admin/login';
}
