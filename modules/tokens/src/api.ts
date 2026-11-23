import type { ExtensionApi } from '@qodalis/cli-server-dashboard-kit';

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
  /** `host`: created by the host application, accepted only by its own API. Absent on servers before 1.0.0-beta.29. */
  audience?: 'cli' | 'host';
  /** Absent: the owner's full permissions. */
  permissions?: string[];
  /** Requests made with the token (UTC days); only when the server counts API usage (its public-api plugin). */
  usage?: ApiTokenUsage;
}

export interface ApiTokenUsage {
  today: number;
  /** The sum of `days`. */
  last30Days: number;
  /** Exactly 30 days, oldest first, the last one today (UTC). */
  days: { date: string; requests: number }[];
}

/** A permission the server, its plugins or the host application declare (`GET /api/v1/qcli/permissions`). */
export interface CliPermission {
  /** A concrete permission (`files:read`): lower case, no wildcard. */
  name: string;
  /** One line, as the server words it (not translated). */
  description: string;
  /** Heading the entry is listed under (`Files`, `Jobs`, …). */
  group: string;
  /** `cli`: the server's routes; `host`: the host application's own API (host tokens only). */
  surface: 'cli' | 'host';
}

export const API = '/api/v1/qcli/tokens';

/** The signed-in user's tokens, or every user's with `all` (needs `tokens:read`). */
export function getApiTokens(api: ExtensionApi, all = false): Promise<ApiTokenView[]> {
  return api.get<ApiTokenView[]>(all ? `${API}?all=true` : API);
}

/** Revokes a token (own tokens, or any with `tokens:revoke`). */
export function revokeApiToken(api: ExtensionApi, id: string): Promise<void> {
  return api.del<void>(`${API}/${encodeURIComponent(id)}`);
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
export function createApiToken(api: ExtensionApi, request: CreateApiTokenRequest): Promise<CreateApiTokenResponse> {
  return api.post<CreateApiTokenResponse>(API, request);
}

/**
 * The permissions the signed-in user holds, in the server's order; every catalog entry with `all` (needs
 * `users:read`). Servers before 1.0.0-beta.29 answer 404. Quiet: only descriptions depend on it, so a 401 here is
 * no reason to sign out.
 */
export function getPermissions(api: ExtensionApi, all = false): Promise<CliPermission[]> {
  return api.get<CliPermission[]>(all ? '/api/v1/qcli/permissions?all=true' : '/api/v1/qcli/permissions', { quiet: true });
}
