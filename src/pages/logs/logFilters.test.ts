import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../types';
import {
  ALL_LEVELS, acceptsLiveEntry, canLoadOlder, filtersOnServer, levelParam, matchesFilters, rangeBounds,
  type Level, type LogFilters,
} from './logFilters';

const NOW = Date.parse('2026-11-05T20:00:00.000Z');

const filters = (overrides: Partial<LogFilters> = {}): LogFilters => ({
  levels: new Set<Level>(ALL_LEVELS), search: '', service: '', range: 'live', customFrom: '', customTo: '', ...overrides,
});

const entry = (overrides: Partial<LogEntry> = {}): LogEntry => ({
  timestamp: '2026-11-05T20:00:00.000Z', level: 'INFO', message: 'Fetched ing: 5 rates', source: 'RateBell.Fetch',
  service: 'ratebell-jobs', ...overrides,
});

describe('levelParam', () => {
  it('is left out when every level is shown, otherwise lists them in order', () => {
    expect(levelParam(new Set(ALL_LEVELS))).toBeUndefined();
    expect(levelParam(new Set<Level>(['ERROR', 'WARN']))).toBe('WARN,ERROR');
  });
});

describe('rangeBounds', () => {
  it('is open for live, starts back from now for a preset', () => {
    expect(rangeBounds(filters(), NOW)).toEqual({});
    expect(rangeBounds(filters({ range: '1h' }), NOW)).toEqual({ from: '2026-11-05T19:00:00.000Z' });
    expect(rangeBounds(filters({ range: '7d' }), NOW)).toEqual({ from: '2026-10-29T20:00:00.000Z' });
  });

  it('takes a custom range in the viewer time zone, a missing or bad bound left open', () => {
    const from = '2026-11-05T10:00';
    expect(rangeBounds(filters({ range: 'custom', customFrom: from, customTo: '' }), NOW))
      .toEqual({ from: new Date(from).toISOString(), to: undefined });
    expect(rangeBounds(filters({ range: 'custom', customFrom: 'nonsense' }), NOW)).toEqual({ from: undefined, to: undefined });
  });
});

describe('matchesFilters', () => {
  it('checks the level, the text in the message or source ignoring case, and the service', () => {
    expect(matchesFilters(entry(), filters())).toBe(true);
    expect(matchesFilters(entry(), filters({ levels: new Set<Level>(['ERROR']) }))).toBe(false);
    expect(matchesFilters(entry(), filters({ search: ' FETCHED ' }))).toBe(true);
    expect(matchesFilters(entry(), filters({ search: 'ratebell.fetch' }))).toBe(true);
    expect(matchesFilters(entry(), filters({ search: 'timeout' }))).toBe(false);
    expect(matchesFilters(entry(), filters({ service: 'ratebell-jobs' }))).toBe(true);
    expect(matchesFilters(entry(), filters({ service: 'ratebell-api' }))).toBe(false);
  });
});

describe('acceptsLiveEntry', () => {
  it('takes matching entries while the range is open', () => {
    expect(acceptsLiveEntry(entry(), filters({ range: '15m' }), NOW)).toBe(true);
    expect(acceptsLiveEntry(entry({ level: 'DEBUG' }), filters({ levels: new Set<Level>(['INFO']) }), NOW)).toBe(false);
  });

  it('takes nothing once a custom range has ended', () => {
    const ended = filters({ range: 'custom', customTo: '2026-11-04T10:00' });
    const open = filters({ range: 'custom', customFrom: '2026-11-04T10:00' });

    expect(acceptsLiveEntry(entry(), ended, NOW)).toBe(false);
    expect(acceptsLiveEntry(entry(), open, NOW)).toBe(true);
  });
});

describe('canLoadOlder', () => {
  it('counts against the total, or follows hasMore when the store cannot count', () => {
    expect(canLoadOlder({ total: 250 }, 100)).toBe(true);
    expect(canLoadOlder({ total: 100 }, 100)).toBe(false);
    expect(canLoadOlder({ total: null, hasMore: true }, 100)).toBe(true);
    expect(canLoadOlder({ total: null, hasMore: false }, 100)).toBe(false);
    expect(canLoadOlder({ total: null }, 100)).toBe(false);
  });
});

describe('filtersOnServer', () => {
  it('is true for servers that say where their history is', () => {
    expect(filtersOnServer({ store: 'seq' })).toBe(true);
    expect(filtersOnServer({ store: 'memory' })).toBe(true);
    expect(filtersOnServer({})).toBe(false);
  });
});
