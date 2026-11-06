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

/**
 * The time bounds older pages are asked with: the first page's bounds, closed at its newest entry when they are open.
 * Entries written after the first page then do not shift the offsets, so paging neither repeats nor skips entries
 * (Seq holds other services' entries, which never reach the live tail).
 */
export function olderPageBounds(bounds: { from?: string; to?: string }, newest: LogEntry | undefined): { from?: string; to?: string } {
  if (bounds.to || !newest) return bounds;
  const time = new Date(newest.timestamp).getTime();
  if (Number.isNaN(time)) return bounds;
  // The end is exclusive and timestamps may carry more than milliseconds: one millisecond later keeps the newest entry
  return { ...bounds, to: new Date(time + 1).toISOString() };
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

/** Time window, column count and column size of the volume chart for the filters' range. */
export function histogramWindow(
  filters: Pick<LogFilters, 'range' | 'customFrom' | 'customTo'>, now = Date.now(),
): { from: number; to: number; buckets: number } {
  const span = (ms: number, buckets: number) => {
    const size = ms / buckets;
    // Columns aligned to their size, the last one holding now
    const to = (Math.floor(now / size) + 1) * size;
    return { from: to - ms, to, buckets };
  };
  switch (filters.range) {
    case 'live':
    case '1h':
      return span(RANGE_MS['1h'], 30);
    case '15m':
      return span(RANGE_MS['15m'], 15);
    case '24h':
      return span(RANGE_MS['24h'], 24);
    case '7d':
      return span(RANGE_MS['7d'], 28);
    case 'custom': {
      const { from, to } = rangeBounds(filters, now);
      const end = to ? Date.parse(to) : now;
      const start = from ? Date.parse(from) : end - RANGE_MS['24h'];
      return end > start ? { from: start, to: end, buckets: 30 } : span(RANGE_MS['24h'], 24);
    }
  }
}

/** A time as a `datetime-local` value in the viewer's time zone (minutes). */
export function toLocalInput(time: number): string {
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The filters as URL parameters (defaults left out), so a filtered view can be reloaded and shared. */
export function filtersToParams(filters: LogFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set('q', filters.search.trim());
  const levels = levelParam(filters.levels);
  if (levels) params.set('level', levels);
  if (filters.service) params.set('service', filters.service);
  if (filters.range !== 'live') params.set('range', filters.range);
  if (filters.range === 'custom') {
    if (filters.customFrom) params.set('from', filters.customFrom);
    if (filters.customTo) params.set('to', filters.customTo);
  }
  return params;
}

/** Filters read from URL parameters; anything missing or unknown is the default. */
export function filtersFromParams(params: URLSearchParams): LogFilters {
  const levels = (params.get('level') ?? '').split(',').map(l => l.trim().toUpperCase()).filter((l): l is Level => (ALL_LEVELS as readonly string[]).includes(l));
  const range = params.get('range');
  return {
    levels: new Set(levels.length ? levels : ALL_LEVELS),
    search: params.get('q') ?? '',
    service: params.get('service') ?? '',
    range: (RANGES as readonly string[]).includes(range ?? '') ? range as Range : 'live',
    customFrom: params.get('from') ?? '',
    customTo: params.get('to') ?? '',
  };
}

/** An entry as one line of text (its exception on the lines below), for export and copying. */
export function entryLine(e: LogEntry): string {
  return `[${e.timestamp}] [${e.level}]${e.service ? ` [${e.service}]` : ''} [${e.source}] ${e.message}` +
    (e.exception ? `\n${e.exception}` : '');
}

/** Exceptions longer than this many lines start collapsed. */
export const EXCEPTION_PREVIEW_LINES = 3;

/** The first lines of an exception and how many more are hidden (0 when it is short enough to show whole). */
export function exceptionPreview(exception: string): { preview: string; hidden: number } {
  const lines = exception.split('\n');
  if (lines.length <= EXCEPTION_PREVIEW_LINES) return { preview: exception, hidden: 0 };
  return { preview: lines.slice(0, EXCEPTION_PREVIEW_LINES).join('\n'), hidden: lines.length - EXCEPTION_PREVIEW_LINES };
}
