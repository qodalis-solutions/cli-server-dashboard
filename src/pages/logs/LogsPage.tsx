import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { useWebSocket } from '../../context/WebSocketContext';
import { getLogs } from '../../api/logs';
import { useI18n, type MessageKey } from '../../i18n';
import type { LogEntry, LogsResponse } from '../../types';
import {
  ALL_LEVELS, RANGES, acceptsLiveEntry, canLoadOlder, filtersOnServer, levelParam, matchesFilters, rangeBounds,
  type Level, type LogFilters, type Range,
} from './logFilters';

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'text-muted',
  INFO: 'text-info',
  WARN: 'text-warning',
  ERROR: 'text-error',
};

const LEVEL_BG: Record<string, string> = {
  DEBUG: 'bg-subtle/20',
  INFO: 'bg-info/20',
  WARN: 'bg-warning/20',
  ERROR: 'bg-error/20',
};

const RANGE_LABELS: Record<Range, MessageKey> = {
  live: 'logs.rangeLive',
  '15m': 'logs.range15m',
  '1h': 'logs.range1h',
  '24h': 'logs.range24h',
  '7d': 'logs.range7d',
  custom: 'logs.rangeCustom',
};

/** Server error text when there is one, otherwise a translated fallback. */
type LoadError = { message: string } | { key: MessageKey };

/** What the server said about its history, without the entries. */
type HistoryInfo = Omit<LogsResponse, 'entries'>;

const TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
};

const PAGE_SIZE = 100;
const SEARCH_DELAY_MS = 300;

const CONTROL = 'px-3 py-1.5 text-sm bg-control border border-border rounded-lg text-text focus:outline-none focus:border-primary/50';

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-warning/30 text-heading">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

/** `seq` -> `Seq`. */
function storeName(store: string): string {
  return store.charAt(0).toUpperCase() + store.slice(1);
}

export default function LogsPage() {
  const { t, formatDate } = useI18n();
  const { subscribe } = useWebSocket();
  /** Oldest first: older pages go on top, live entries at the bottom. */
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [info, setInfo] = useState<HistoryInfo | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);

  const [enabledLevels, setEnabledLevels] = useState<Set<Level>>(new Set(ALL_LEVELS));
  const [search, setSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [service, setService] = useState('');
  const [range, setRange] = useState<Range>('live');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const serverSide = info !== null && filtersOnServer(info);
  const filters: LogFilters = { levels: enabledLevels, search, service, range, customFrom, customTo };
  // The latest filters for requests and the live tail, set before the effects that read them run.
  const filtersRef = useRef(filters);
  const serverSideRef = useRef(serverSide);
  useLayoutEffect(() => {
    filtersRef.current = filters;
    serverSideRef.current = serverSide;
  });
  /** Only the latest request's answer is shown. */
  const requestRef = useRef(0);

  /** The server-side query for the current filters (a server that does not filter ignores them). */
  const query = useCallback((offset: number) => {
    const current = filtersRef.current;
    return getLogs({
      level: serverSideRef.current ? levelParam(current.levels) : undefined,
      search: serverSideRef.current ? current.search : undefined,
      service: serverSideRef.current ? current.service || undefined : undefined,
      ...(serverSideRef.current ? rangeBounds(current) : {}),
      limit: PAGE_SIZE,
      offset,
    });
  }, []);

  const reload = useCallback(() => {
    const request = ++requestRef.current;
    query(0)
      .then(res => {
        if (request !== requestRef.current) return;
        const { entries, ...rest } = res;
        setLogs([...entries].reverse());
        setInfo(rest);
        setLoaded(entries.length);
        setError(null);
      })
      .catch(err => {
        if (request !== requestRef.current) return;
        setError(err instanceof Error ? { message: err.message } : { key: 'logs.loadFailed' });
      })
      .finally(() => {
        if (request === requestRef.current) setInitialLoading(false);
      });
  }, [query]);

  useEffect(() => {
    reload();
  }, [reload]);

  // The text filter asks the server once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setServerSearch(search), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // A server that filters is asked again when a filter changes; otherwise the page filters what it has.
  const levelKey = levelParam(enabledLevels) ?? '';
  const filterKey = [levelKey, serverSearch, service, range, customFrom, customTo].join('\u0000');
  /** The filters of the shown history; null until the server is known to filter. */
  const shownKey = useRef<string | null>(null);
  useEffect(() => {
    if (!serverSide) return;
    if (shownKey.current === null) {
      // The first page was asked without filters, which are still the defaults.
      shownKey.current = filterKey;
      return;
    }
    if (shownKey.current === filterKey) return;
    shownKey.current = filterKey;
    reload();
  }, [filterKey, serverSide, reload]);

  async function loadMore() {
    setLoadingMore(true);
    const request = requestRef.current;
    try {
      const res = await query(loaded);
      if (request !== requestRef.current) return;
      setLogs(prev => [...[...res.entries].reverse(), ...prev]);
      setLoaded(prev => prev + res.entries.length);
      setInfo(prev => (prev ? { ...prev, total: res.total, hasMore: res.hasMore } : prev));
    } catch (err) {
      setError(err instanceof Error ? { message: err.message } : { key: 'logs.loadMoreFailed' });
    } finally {
      setLoadingMore(false);
    }
  }

  // Stream live log events
  useEffect(() => {
    const unsub = subscribe('log:entry', (event) => {
      const entry = event as unknown as LogEntry;
      if (!entry.timestamp || !entry.level || !entry.message) return;
      // A filtered history only takes what matches; otherwise every entry is kept and the page filters.
      if (serverSideRef.current && !acceptsLiveEntry(entry, filtersRef.current)) return;
      setLogs(prev => [...prev, entry]);
      setInfo(prev => (prev && prev.total != null ? { ...prev, total: prev.total + 1 } : prev));
      setLoaded(prev => prev + 1);
    });
    return unsub;
  }, [subscribe]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  function toggleLevel(level: Level) {
    setEnabledLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) {
        if (next.size > 1) next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }

  const filteredLogs = logs.filter(entry => matchesFilters(entry, filters));

  const services = info?.services ?? [];
  const showServiceFilter = serverSide && (services.length > 1 || info?.persistent === true);
  const showRange = serverSide && info?.persistent === true;
  const showService = services.length > 1 || new Set(logs.map(e => e.service).filter(Boolean)).size > 1;

  function handleExport() {
    const content = filteredLogs
      .map(e => `[${e.timestamp}] [${e.level}]${e.service ? ` [${e.service}]` : ''} [${e.source}] ${e.message}` +
        (e.exception ? `\n${e.exception}` : ''))
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `server-logs-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canLoadMore = info !== null && canLoadOlder(info, loaded);
  const storeText = info?.store
    ? info.persistent ? t('logs.storePersistent', { store: storeName(info.store) }) : t('logs.storeMemory')
    : null;

  return (
    <div>
      <PageHeader
        title={t('nav.logs')}
        subtitle={storeText
          ? `${t('logs.shown', { count: filteredLogs.length })} · ${storeText}`
          : t('logs.shown', { count: filteredLogs.length })}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={filteredLogs.length === 0}
              title={t('logs.exportTitle')}
              className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors disabled:opacity-40"
            >
              {t('logs.export')}
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2" role="group" aria-label={t('logs.levels')}>
            {ALL_LEVELS.map(level => (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                aria-pressed={enabledLevels.has(level)}
                title={t(enabledLevels.has(level) ? 'logs.hideLevel' : 'logs.showLevel', { level })}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                  enabledLevels.has(level)
                    ? `${LEVEL_BG[level]} ${LEVEL_COLORS[level]} border-current/30`
                    : 'bg-surface/75 text-subtle border-border/75'
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder={t('logs.search')}
            aria-label={t('logs.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`flex-1 max-w-sm placeholder-subtle ${CONTROL}`}
          />

          {showServiceFilter && (
            <select
              aria-label={t('logs.service')}
              value={service}
              onChange={e => setService(e.target.value)}
              className={CONTROL}
            >
              <option value="">{t('logs.allServices')}</option>
              {services.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          )}

          {showRange && (
            <select
              aria-label={t('logs.range')}
              value={range}
              onChange={e => setRange(e.target.value as Range)}
              className={CONTROL}
            >
              {RANGES.map(r => <option key={r} value={r}>{t(RANGE_LABELS[r])}</option>)}
            </select>
          )}

          {showRange && range === 'custom' && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <label className="flex items-center gap-1">
                {t('logs.from')}
                <input type="datetime-local" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={CONTROL} />
              </label>
              <label className="flex items-center gap-1">
                {t('logs.to')}
                <input type="datetime-local" value={customTo} onChange={e => setCustomTo(e.target.value)} className={CONTROL} />
              </label>
            </div>
          )}
        </div>

        {/* Load more older logs */}
        {canLoadMore && !initialLoading && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-xs text-accent hover:text-accent transition-colors disabled:opacity-50"
          >
            {loadingMore
              ? t('common.loading')
              : info?.total != null
                ? t('logs.loadOlder', { remaining: info.total - loaded })
                : t('logs.loadOlderMore')}
          </button>
        )}

        {initialLoading && <div className="text-muted text-sm">{t('logs.loading')}</div>}
        {error && <div className="text-error text-sm">
            {t('logs.error', { message: 'message' in error ? error.message : t(error.key) })}
          </div>}

        {/* Log Viewer */}
        {!initialLoading && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border/75 flex items-center justify-between">
              <span className="text-sm font-medium text-heading">{t('logs.output')}</span>
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                aria-pressed={autoScroll}
                title={t('logs.autoScrollTitle')}
                className={`text-[10px] px-2 py-0.5 rounded ${autoScroll ? 'bg-primary/20 text-accent' : 'bg-control text-muted'}`}
              >
                {autoScroll ? t('logs.autoScrollOn') : t('logs.autoScrollOff')}
              </button>
            </div>
            <div
              ref={containerRef}
              onScroll={() => {
                if (!containerRef.current) return;
                const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
                setAutoScroll(scrollHeight - scrollTop - clientHeight < 60);
              }}
              className="overflow-y-auto max-h-[60vh] p-3 font-mono text-xs leading-5"
            >
              {filteredLogs.length === 0 ? (
                <div className="text-subtle py-4 text-center">{t('logs.noMatches')}</div>
              ) : (
                filteredLogs.map((entry, idx) => (
                  <div key={idx} className="flex items-start gap-2 py-0.5 hover:bg-surface/75 rounded px-1">
                    <time dateTime={entry.timestamp} className="text-subtle shrink-0 text-[10px]">
                      {formatDate(entry.timestamp, TIMESTAMP_FORMAT)}
                    </time>
                    <span className={`shrink-0 font-bold w-12 text-[10px] ${LEVEL_COLORS[entry.level] ?? 'text-muted'}`}>
                      {entry.level}
                    </span>
                    {showService && entry.service && (
                      <span className="shrink-0 text-[10px] px-1 rounded bg-control text-muted max-w-[120px] truncate" title={entry.service}>
                        {entry.service}
                      </span>
                    )}
                    {entry.source && (
                      <span className="text-subtle shrink-0 text-[10px] max-w-[120px] truncate" title={entry.source}>
                        [{entry.source}]
                      </span>
                    )}
                    <div className={`flex-1 min-w-0 ${LEVEL_COLORS[entry.level] ?? 'text-text'}`}>
                      <span className="whitespace-pre-wrap break-all">{highlight(entry.message, search)}</span>
                      {entry.exception && (
                        <pre className="mt-0.5 text-[10px] text-muted whitespace-pre-wrap break-all">{entry.exception}</pre>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
