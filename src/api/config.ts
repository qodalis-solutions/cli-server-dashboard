import { apiFetch, ApiError } from './client';
import type { ConfigProvider, ConfigStoreDescription, ConfigValue, ServerConfigResponse, UpdateConfigRequest, UpdateConfigResponse } from '../types';

const BASE = '/api/v1/qcli/config';

/**
 * The providers and the default store of `GET /api/v1/qcli/config`. `defaultStore` is the server's `defaultStore`, or
 * the single `store` of older servers, or null when neither is sent; each writable provider may bring its own `store`.
 */
export interface ConfigOverview {
  providers: ConfigProvider[];
  defaultStore: ConfigStoreDescription | null;
}

function storeOf(value: unknown): ConfigStoreDescription | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Partial<ConfigStoreDescription>;
  if (typeof s.kind !== 'string') return null;
  return {
    kind: s.kind,
    title: typeof s.title === 'string' ? s.title : '',
    detail: typeof s.detail === 'string' ? s.detail : '',
    persistent: s.persistent === true,
  };
}

/** A provider with its `store` checked: dropped when the server sends none or a malformed one. */
function withStore(provider: ConfigProvider): ConfigProvider {
  const { store, ...rest } = provider;
  const checked = storeOf(store);
  return checked ? { ...rest, store: checked } : rest;
}

/** Every config provider the user may read, with their sections and stores, and the default store (`GET /api/v1/qcli/config`). */
export async function getConfigOverview(): Promise<ConfigOverview> {
  const res = await apiFetch<ServerConfigResponse>(BASE);
  return {
    providers: Array.isArray(res?.providers) ? res.providers.map(withStore) : [],
    defaultStore: storeOf(res?.defaultStore) ?? storeOf(res?.store),
  };
}

/** Every config provider the user may read, with their sections (`GET /api/v1/qcli/config`). */
export async function getConfig(): Promise<ConfigProvider[]> {
  return (await getConfigOverview()).providers;
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
