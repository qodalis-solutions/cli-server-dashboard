import { useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { useWebSocket } from '../../context/WebSocketContext';
import { getLogs } from '../../api/logs';
import type { LogEntry } from '../../types';

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'text-slate-400',
  INFO: 'text-blue-400',
  WARN: 'text-amber-400',
  ERROR: 'text-red-400',
};

const LEVEL_BG: Record<string, string> = {
  DEBUG: 'bg-slate-500/20',
  INFO: 'bg-blue-500/20',
  WARN: 'bg-amber-500/20',
  ERROR: 'bg-red-500/20',
};

const ALL_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
type Level = typeof ALL_LEVELS[number];

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-yellow-400/30 text-yellow-200">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function LogsPage() {
  const { subscribe } = useWebSocket();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [enabledLevels, setEnabledLevels] = useState<Set<Level>>(new Set(ALL_LEVELS));
  const [search, setSearch] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const PAGE_SIZE = 100;

  useEffect(() => {
    setInitialLoading(true);
    getLogs({ limit: PAGE_SIZE, offset: 0 })
      .then(res => {
        setLogs(res.entries);
        setTotalLogs(res.total);
        setOffset(res.entries.length);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load logs'))
      .finally(() => setInitialLoading(false));
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await getLogs({ limit: PAGE_SIZE, offset });
      setLogs(prev => [...res.entries, ...prev]);
      setOffset(prev => prev + res.entries.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more logs');
    } finally {
      setLoadingMore(false);
    }
  }

  // Stream live log events
  useEffect(() => {
    const unsub = subscribe('log:entry', (event) => {
      const entry = event as unknown as LogEntry;
      if (entry.timestamp && entry.level && entry.message) {
        setLogs(prev => [...prev, entry]);
        setTotalLogs(prev => prev + 1);
      }
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

  const filteredLogs = logs.filter(entry => {
    if (!enabledLevels.has(entry.level as Level)) return false;
    if (search && !entry.message.toLowerCase().includes(search.toLowerCase()) &&
        !entry.source.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  function handleExport() {
    const content = filteredLogs
      .map(e => `[${e.timestamp}] [${e.level}] [${e.source}] ${e.message}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `server-logs-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canLoadMore = offset < totalLogs;

  return (
    <div>
      <PageHeader
        title="Logs"
        subtitle={`${filteredLogs.length} entries shown`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={filteredLogs.length === 0}
              className="px-3 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors disabled:opacity-40"
            >
              Export
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            {ALL_LEVELS.map(level => (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                  enabledLevels.has(level)
                    ? `${LEVEL_BG[level]} ${LEVEL_COLORS[level]} border-current/30`
                    : 'bg-white/[0.03] text-slate-600 border-white/[0.06]'
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search logs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 max-w-sm px-3 py-1.5 text-sm bg-white/[0.06] border border-white/[0.1] rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* Load more older logs */}
        {canLoadMore && !initialLoading && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading...' : `Load older logs (${totalLogs - offset} remaining)`}
          </button>
        )}

        {initialLoading && <div className="text-slate-400 text-sm">Loading logs...</div>}
        {error && <div className="text-red-400 text-sm">Error: {error}</div>}

        {/* Log Viewer */}
        {!initialLoading && (
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-sm font-medium text-white">Log Output</span>
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`text-[10px] px-2 py-0.5 rounded ${autoScroll ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/[0.06] text-slate-400'}`}
              >
                {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
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
                <div className="text-slate-500 py-4 text-center">No log entries match the current filters.</div>
              ) : (
                filteredLogs.map((entry, idx) => (
                  <div key={idx} className="flex items-start gap-2 py-0.5 hover:bg-white/[0.03] rounded px-1">
                    <span className="text-slate-600 shrink-0 text-[10px]">{entry.timestamp.replace('T', ' ').slice(0, 19)}</span>
                    <span className={`shrink-0 font-bold w-12 text-[10px] ${LEVEL_COLORS[entry.level] ?? 'text-slate-400'}`}>
                      {entry.level}
                    </span>
                    {entry.source && (
                      <span className="text-slate-600 shrink-0 text-[10px] max-w-[120px] truncate" title={entry.source}>
                        [{entry.source}]
                      </span>
                    )}
                    <span className={`flex-1 whitespace-pre-wrap break-all ${LEVEL_COLORS[entry.level] ?? 'text-slate-300'}`}>
                      {highlight(entry.message, search)}
                    </span>
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
