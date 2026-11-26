import { apiFetch, ApiError } from './client';
import type { UpdateItem, UpdatesResult } from '../types';

const BASE = '/api/v1/qcli/updates';

/** Seeing the available updates and checking for them (`plugins:install` may too). */
export const UPDATES_PERMISSION = 'updates:read';

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const KINDS = ['dashboard', 'server', 'core'] as const;
const SOURCES = ['marketplace', 'code', 'npm'] as const;

/** One update of a response; null when malformed. */
export function readUpdateItem(value: unknown): UpdateItem | null {
  if (!isObject(value) || typeof value.name !== 'string' || !value.name) return null;
  const kind = KINDS.includes(value.kind as UpdateItem['kind']) ? (value.kind as UpdateItem['kind']) : null;
  if (!kind) return null;
  const install: Record<string, string> = {};
  if (isObject(value.install)) {
    for (const [platform, command] of Object.entries(value.install)) if (typeof command === 'string' && command) install[platform] = command;
  }
  return {
    kind,
    name: value.name,
    package: str(value.package) ?? value.name,
    title: str(value.title) ?? value.name,
    icon: str(value.icon),
    current: str(value.current),
    latest: str(value.latest),
    source: SOURCES.includes(value.source as UpdateItem['source']) ? (value.source as UpdateItem['source']) : 'code',
    updateAvailable: value.updateAvailable !== false,
    canUpdate: value.canUpdate === true,
    ...(str(value.reason) ? { reason: str(value.reason)! } : {}),
    install,
  };
}

/** The result of a response; null when it is not one. */
export function readUpdates(value: unknown): UpdatesResult | null {
  if (!isObject(value) || !('dashboardPlugins' in value || 'serverPlugins' in value || 'checkedAt' in value)) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(readUpdateItem).filter((i): i is UpdateItem => i !== null) : []);
  const result: UpdatesResult = {
    checkedAt: str(value.checkedAt),
    checking: value.checking === true,
    ...(str(value.error) ? { error: str(value.error)! } : {}),
    server: readUpdateItem(value.server),
    dashboardPlugins: list(value.dashboardPlugins),
    serverPlugins: list(value.serverPlugins),
    codePlugins: list(value.codePlugins),
    count: 0,
  };
  result.count = typeof value.count === 'number' && value.count >= 0
    ? value.count
    : result.dashboardPlugins.length + result.serverPlugins.length + result.codePlugins.length + (result.server?.updateAvailable ? 1 : 0);
  return result;
}

/**
 * The last check's result (`GET /api/v1/qcli/updates`); null on a server without it (404/405) or for a user who may
 * not see it (403).
 */
export async function getUpdates(): Promise<UpdatesResult | null> {
  try {
    return readUpdates(await apiFetch<unknown>(BASE));
  } catch (err) {
    if (err instanceof ApiError && [403, 404, 405].includes(err.status)) return null;
    throw err;
  }
}

/** Checks now (`POST /api/v1/qcli/updates/check`) and resolves with the new result. */
export async function checkUpdates(): Promise<UpdatesResult | null> {
  return readUpdates(await apiFetch<unknown>(`${BASE}/check`, { method: 'POST' }));
}
