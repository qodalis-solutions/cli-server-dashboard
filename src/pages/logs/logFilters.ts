import type { LogEntry, LogsResponse } from '../../types';

export const ALL_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
export type Level = typeof ALL_LEVELS[number];

/** The time ranges offered for a persistent history; `live` is everything, newest last. */
export const RANGES = ['live', '15m', '1h', '24h', '7d', 'custom'] as const;
export type Range = typeof RANGES[number];

const RANGE_MS: Record<Exclude<Range, 'live' | 'custom'>, number> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
};

export interface LogFilters {
  levels: ReadonlySet<Level>;
  search: string;
  /** Empty for every service. */
  service: string;
  range: Range;
  /** `datetime-local` values (the viewer's time zone) of a custom range. */
  customFrom: string;
  customTo: string;
}

/** The `level` parameter: none when every level is shown. */
export function levelParam(levels: ReadonlySet<Level>): string | undefined {
  return levels.size === ALL_LEVELS.length ? undefined : ALL_LEVELS.filter(l => levels.has(l)).join(',');
}

/** The ISO bounds of a range at `now`; a custom bound left empty is open. */
export function rangeBounds(filters: Pick<LogFilters, 'range' | 'customFrom' | 'customTo'>, now = Date.now()): { from?: string; to?: string } {
  if (filters.range === 'live') return {};
  if (filters.range === 'custom') {
    const iso = (value: string) => {
      const time = value ? new Date(value).getTime() : NaN;
      return Number.isNaN(time) ? undefined : new Date(time).toISOString();
    };
    return { from: iso(filters.customFrom), to: iso(filters.customTo) };
  }
  return { from: new Date(now - RANGE_MS[filters.range]).toISOString() };
}

/** Whether a live entry belongs in the shown list: the filters match and the range is still open at its end. */
export function acceptsLiveEntry(entry: LogEntry, filters: LogFilters, now = Date.now()): boolean {
  const { to } = rangeBounds(filters, now);
  if (to && new Date(to).getTime() <= now) return false;
  return matchesFilters(entry, filters);
}

/** Level, text and service filters, as the server applies them. */
export function matchesFilters(entry: LogEntry, filters: Pick<LogFilters, 'levels' | 'search' | 'service'>): boolean {
  if (!filters.levels.has(entry.level as Level)) return false;
  const search = filters.search.trim().toLowerCase();
  if (search && !entry.message.toLowerCase().includes(search) && !(entry.source ?? '').toLowerCase().includes(search)) {
    return false;
  }
  return !filters.service || entry.service === filters.service;
}

/** Whether older entries can be loaded: by the total when the store counts, otherwise by `hasMore`. */
export function canLoadOlder(response: Pick<LogsResponse, 'total' | 'hasMore'>, loaded: number): boolean {
  return response.total != null ? loaded < response.total : response.hasMore === true;
}

/** Whether the server filters (and so the page asks it again when a filter changes). */
export function filtersOnServer(response: Pick<LogsResponse, 'store'>): boolean {
  return response.store !== undefined;
}
