import { apiFetch, setToken, clearToken } from './client';

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

export function logout(): void {
  clearToken();
  window.location.href = '/qcli/admin/login';
}
