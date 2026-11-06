import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../types';
import {
  ALL_LEVELS, acceptsLiveEntry, entryLine, exceptionPreview, canLoadOlder, filtersFromParams, filtersOnServer, filtersToParams, histogramWindow,
  levelParam, matchesFilters, olderPageBounds, rangeBounds, toLocalInput, type Level, type LogFilters,
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

describe('olderPageBounds', () => {
  it('closes open bounds just after the newest entry of the first page', () => {
    const newest = entry({ timestamp: '2026-11-05T19:59:58.1234567Z' });
    expect(olderPageBounds({}, newest)).toEqual({ to: '2026-11-05T19:59:58.124Z' });
    expect(olderPageBounds({ from: '2026-11-05T19:00:00.000Z' }, newest))
      .toEqual({ from: '2026-11-05T19:00:00.000Z', to: '2026-11-05T19:59:58.124Z' });
  });

  it('keeps a range that already ends, and open bounds without entries', () => {
    const closed = { from: undefined, to: '2026-11-05T12:00:00.000Z' };
    expect(olderPageBounds(closed, entry())).toBe(closed);
    expect(olderPageBounds({}, undefined)).toEqual({});
    expect(olderPageBounds({}, entry({ timestamp: 'nonsense' }))).toEqual({});
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

describe('histogramWindow', () => {
  it('ends the last column after now and fits the range', () => {
    const live = histogramWindow(filters(), NOW);
    expect(live.buckets).toBe(30);
    expect(live.to - live.from).toBe(3_600_000);
    expect(live.to).toBeGreaterThan(NOW);
    expect(histogramWindow(filters({ range: '7d' }), NOW).buckets).toBe(28);
  });

  it('takes a custom range as it is, or the last day without bounds', () => {
    const custom = histogramWindow(filters({ range: 'custom', customFrom: '2026-11-05T10:00', customTo: '2026-11-05T12:00' }), NOW);
    expect(custom.to - custom.from).toBe(2 * 3_600_000);
    expect(histogramWindow(filters({ range: 'custom' }), NOW).to - histogramWindow(filters({ range: 'custom' }), NOW).from).toBe(86_400_000);
  });
});

describe('URL filters', () => {
  it('round-trips, leaving defaults out', () => {
    expect(filtersToParams(filters()).toString()).toBe('');
    const set = filters({ levels: new Set<Level>(['ERROR', 'WARN']), search: ' boom ', service: 'api', range: 'custom', customFrom: '2026-11-05T10:00' });
    const params = filtersToParams(set);
    expect(params.toString()).toBe('q=boom&level=WARN%2CERROR&service=api&range=custom&from=2026-11-05T10%3A00');
    const back = filtersFromParams(params);
    expect([...back.levels]).toEqual(['WARN', 'ERROR']);
    expect(back).toMatchObject({ search: 'boom', service: 'api', range: 'custom', customFrom: '2026-11-05T10:00', customTo: '' });
  });

  it('ignores unknown values', () => {
    const back = filtersFromParams(new URLSearchParams('level=LOUD&range=forever'));
    expect(back.levels.size).toBe(4);
    expect(back.range).toBe('live');
  });

  it('writes local datetime-local values', () => {
    expect(toLocalInput(new Date(2026, 10, 5, 9, 7).getTime())).toBe('2026-11-05T09:07');
  });
});

describe('entryLine', () => {
  it('writes time, level, service, source and message, the exception below', () => {
    expect(entryLine(entry())).toBe('[2026-11-05T20:00:00.000Z] [INFO] [ratebell-jobs] [RateBell.Fetch] Fetched ing: 5 rates');
    expect(entryLine(entry({ service: undefined, level: 'ERROR', exception: 'Boom\n  at X' })))
      .toBe('[2026-11-05T20:00:00.000Z] [ERROR] [RateBell.Fetch] Fetched ing: 5 rates\nBoom\n  at X');
  });
});

describe('exceptionPreview', () => {
  it('shows short exceptions whole and the first lines of long ones', () => {
    expect(exceptionPreview('a\nb\nc')).toEqual({ preview: 'a\nb\nc', hidden: 0 });
    expect(exceptionPreview('a\nb\nc\nd\ne')).toEqual({ preview: 'a\nb\nc', hidden: 2 });
  });
});
