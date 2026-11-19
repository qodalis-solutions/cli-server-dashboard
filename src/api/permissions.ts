import { apiFetch, type ApiFetchOptions } from './client';

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

/**
 * The permissions the signed-in user holds, in the server's order; every catalog entry with `all` (needs
 * `users:read`). Servers before 1.0.0-beta.29 answer 404. `quiet`: a 401 is an error instead of a redirect to sign-in.
 */
export function getPermissions(all = false, options: Pick<ApiFetchOptions, 'quiet'> = {}): Promise<CliPermission[]> {
  return apiFetch<CliPermission[]>(all ? '/api/v1/qcli/permissions?all=true' : '/api/v1/qcli/permissions', options);
}
