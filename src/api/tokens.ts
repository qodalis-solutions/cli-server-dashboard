import { apiFetch } from './client';

/** An API token (`qcli_pat_…`) as `GET /api/v1/qcli/tokens` lists it (users plugin): never the token itself. */
export interface ApiTokenView {
  id: string;
  name: string;
  userId: string;
  userName: string;
  /** Unix time in milliseconds. */
  createdAt: number;
  /** Null: never expires. */
  expiresAt: number | null;
  /** Null: never used (updated at most once a minute). */
  lastUsedAt: number | null;
  /** Absent: the owner's full permissions. */
  permissions?: string[];
}

const BASE = '/api/v1/qcli/tokens';

/** The signed-in user's tokens, or every user's with `all` (needs `tokens:read`). */
export function getApiTokens(all = false): Promise<ApiTokenView[]> {
  return apiFetch<ApiTokenView[]>(all ? `${BASE}?all=true` : BASE);
}

/** Revokes a token (own tokens, or any with `tokens:revoke`). */
export function revokeApiToken(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
