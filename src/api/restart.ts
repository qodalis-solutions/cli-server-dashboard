import { apiFetch, ApiError } from './client';
import type { PendingRestartItem, RestartMode, RestartStatus, RestartSupervisor } from '../types';

const BASE = '/api/v1/qcli/server/restart';

/** The pending list changed (sent to admin:access holders). */
export const RESTART_REQUIRED_EVENT = 'server:restart-required';
/** The server is shutting down to restart (another admin, the CLI command or this page). */
export const RESTARTING_EVENT = 'server:restarting';
/** The permission to restart the server from the dashboard. */
export const RESTART_PERMISSION = 'server:restart';
/** WebSocket close code of a server going down to restart ("service restart"). */
export const SERVICE_RESTART_CLOSE_CODE = 1012;

const MODES: readonly string[] = ['exit', 'self', 'handler', 'auto'];
const SUPERVISORS: readonly string[] = ['docker', 'systemd', 'pm2', 'kubernetes'];

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** The pending entries of a response or event, malformed ones dropped. */
export function pendingOf(value: unknown): PendingRestartItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as { id?: unknown }).id === 'string')
    .map(p => ({ id: p.id as string, source: text(p.source), description: text(p.description), since: text(p.since) }));
}

/** The pending-restart id the server gives a changed config entry that needs a restart. */
export function configRestartId(provider: string, section: string, key: string): string {
  return `config:${provider}.${section}.${key}`;
}

/** One string per set of pending changes: dismissing the banner holds until this changes. */
export function pendingSignature(pending: readonly PendingRestartItem[]): string {
  return pending.map(p => p.id).sort().join('\n');
}

/**
 * What waits for a restart and whether the server can restart itself (`GET /api/v1/qcli/server/restart`, admin:access);
 * null on servers without it (404) or when the user may not read it (403). `quiet`: a 401 is an error instead of a
 * redirect to sign-in (checking whether a restarted server is back).
 */
export async function getRestartStatus(options: { quiet?: boolean } = {}): Promise<RestartStatus | null> {
  let res: Record<string, unknown> | undefined;
  try {
    res = await apiFetch<Record<string, unknown>>(BASE, options);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404 || err.status === 405)) return null;
    throw err;
  }
  if (!res || typeof res !== 'object') return null;
  return {
    supported: res.supported === true,
    mode: MODES.includes(String(res.mode)) ? (res.mode as RestartMode) : null,
    supervisor: SUPERVISORS.includes(String(res.supervisor)) ? (res.supervisor as RestartSupervisor) : null,
    startedAt: typeof res.startedAt === 'string' ? res.startedAt : null,
    pending: pendingOf(res.pending),
  };
}

/** The server cannot restart itself (409: no supervisor detected and no `restart.mode`). */
export class RestartNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RestartNotSupportedError';
  }
}

/**
 * Asks the server to restart (`POST /api/v1/qcli/server/restart`, permission `server:restart`); it answers 202 and
 * then goes down. Rejects with {@link RestartNotSupportedError} on 409, otherwise the {@link ApiError}.
 */
export async function restartServer(reason?: string): Promise<void> {
  const trimmed = reason?.trim();
  try {
    await apiFetch<unknown>(BASE, { method: 'POST', body: JSON.stringify(trimmed ? { reason: trimmed } : {}) });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      let message = err.message;
      try {
        const body = JSON.parse(err.message) as { error?: unknown };
        if (typeof body?.error === 'string') message = body.error;
      } catch {
        // a plain-text body
      }
      throw new RestartNotSupportedError(message);
    }
    throw err;
  }
}

/** The server answers at all (`GET /api/qcli/versions`, no sign-in needed): false while it is down. */
export async function serverResponds(): Promise<boolean> {
  try {
    const res = await fetch('/api/qcli/versions', { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}
