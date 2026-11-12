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

export interface CreateApiTokenRequest {
  /** 1-64 characters of `[A-Za-z0-9._ -]`, unique per user (409 otherwise). */
  name: string;
  /** 1-365; omitted: the server's default (90). */
  expiresInDays?: number;
  /** Only permissions the caller has (403 otherwise); omitted: all of the caller's. */
  permissions?: string[];
}

export interface CreateApiTokenResponse {
  /** The token itself (`qcli_pat_…`): returned once, never again. */
  token: string;
  apiToken: ApiTokenView;
}

/**
 * Creates a token for the signed-in user. Needs a session: 403 when signed in with an API token, 501 when the
 * server signs users in through the host application (no bearer tokens).
 */
export function createApiToken(request: CreateApiTokenRequest): Promise<CreateApiTokenResponse> {
  return apiFetch<CreateApiTokenResponse>(BASE, { method: 'POST', body: JSON.stringify(request) });
}
