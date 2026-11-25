import { apiFetch, ApiError } from './client';
import type { ConfigProvider, ConfigValue, ServerConfigResponse, UpdateConfigRequest, UpdateConfigResponse } from '../types';

const BASE = '/api/v1/qcli/config';

/** Every config provider the user may read, with their sections (`GET /api/v1/qcli/config`). */
export async function getConfig(): Promise<ConfigProvider[]> {
  const res = await apiFetch<ServerConfigResponse>(BASE);
  return Array.isArray(res?.providers) ? res.providers : [];
}

/** One provider (`GET /api/v1/qcli/config/{provider}`). */
export function getConfigProvider(provider: string): Promise<ConfigProvider> {
  return apiFetch<ConfigProvider>(`${BASE}/${encodeURIComponent(provider)}`);
}

/** The server refused the changes: one message per key (400 `{ error: "validation failed", errors }`). */
export class ConfigValidationError extends Error {
  constructor(readonly errors: Record<string, string>) {
    super('validation failed');
    this.name = 'ConfigValidationError';
  }
}

/** The section changed since it was read (409 `{ error: "version conflict", version }`). */
export class ConfigConflictError extends Error {
  constructor(readonly version: string | undefined) {
    super('version conflict');
    this.name = 'ConfigConflictError';
  }
}

function parseBody(message: string): { errors?: unknown; version?: unknown } | null {
  try {
    const body = JSON.parse(message) as unknown;
    return body && typeof body === 'object' ? (body as { errors?: unknown; version?: unknown }) : null;
  } catch {
    return null;
  }
}

/**
 * Changes keys of one section (`PATCH /api/v1/qcli/config/{provider}/{section}`); a null change resets the key to its
 * default, clears a secret or removes a free key. Rejects with {@link ConfigValidationError} (400 with per-key
 * errors), {@link ConfigConflictError} (409) or the {@link ApiError} of any other failure (403, 404, a plain 400).
 */
export async function updateConfigSection(
  provider: string,
  section: string,
  changes: Record<string, ConfigValue>,
  version?: string | null,
): Promise<UpdateConfigResponse> {
  const request: UpdateConfigRequest = { changes, ...(version ? { version } : {}) };
  try {
    return await apiFetch<UpdateConfigResponse>(`${BASE}/${encodeURIComponent(provider)}/${encodeURIComponent(section)}`, {
      method: 'PATCH',
      body: JSON.stringify(request),
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 400 || err.status === 409)) {
      const body = parseBody(err.message);
      if (err.status === 409) throw new ConfigConflictError(typeof body?.version === 'string' ? body.version : undefined);
      const errors = body?.errors;
      if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
        const perKey = Object.fromEntries(
          Object.entries(errors as Record<string, unknown>).filter(([, v]) => typeof v === 'string'),
        ) as Record<string, string>;
        if (Object.keys(perKey).length > 0) throw new ConfigValidationError(perKey);
      }
    }
    throw err;
  }
}
