import ErrorBoundary from '../../components/ErrorBoundary';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import DataTable from '../../components/DataTable';
import { useWebSocket } from '../../context/WebSocketContext';
import { useApi } from '../../hooks/useApi';
import { getWsClients } from '../../api/events';
import type { WsClientInfo } from '../../types';
import { useI18n } from '../../i18n';

interface LiveEvent {
  id: number;
  time: Date;
  type: string;
  payload: string;
}

let eventCounter = 0;

function eventTypeBadgeVariant(type: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (type.startsWith('job:')) return 'info';
  if (type.startsWith('log:')) return 'neutral';
  if (type.startsWith('error:') || type.includes('error')) return 'error';
  if (type.startsWith('warn:') || type.includes('warn')) return 'warning';
  if (type.startsWith('connect') || type.startsWith('session')) return 'success';
  return 'neutral';
}

function clientTypeBadgeVariant(type: string): 'info' | 'success' | 'neutral' {
  if (type === 'events') return 'info';
  if (type === 'shell') return 'success';
  return 'neutral';
}

const MAX_EVENTS = 200;

export default function EventsPage() {
  const { t, formatDate } = useI18n();
  const { subscribe } = useWebSocket();
  const [events, setEvents] = useState<LiveEvent[]>([]);
  // While paused, new events wait here and join the list on resume
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [held, setHeld] = useState<LiveEvent[]>([]);
  const [params, setParams] = useSearchParams();
  const filter = params.get('type') ?? 'all';
  const text = params.get('q') ?? '';
  const setParam = (name: string, value: string | null) => setParams(prev => {
    const next = new URLSearchParams(prev);
    if (value) next.set(name, value);
    else next.delete(name);
    return next;
  }, { replace: true });
  const setFilter = (value: string) => setParam('type', value === 'all' ? null : value);
  const eventListRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // WS clients with auto-refresh every 10s
  const { data: clients, loading: clientsLoading, refetch: refetchClients } = useApi(getWsClients, []);
  useEffect(() => {
    const interval = setInterval(refetchClients, 10000);
    return () => clearInterval(interval);
  }, [refetchClients]);

  useEffect(() => {
    const unsub = subscribe('*', (event) => {
      const type = (event.type as string) ?? 'unknown';
      const newEvent: LiveEvent = {
        id: ++eventCounter,
        time: new Date(),
        type,
        payload: JSON.stringify(event),
      };
      const add = (prev: LiveEvent[]) => {
        const next = [...prev, newEvent];
        return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
      };
      if (pausedRef.current) setHeld(add);
      else setEvents(add);
    });
    return unsub;
  }, [subscribe]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && eventListRef.current) {
      eventListRef.current.scrollTop = eventListRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // Collect unique event type prefixes for filter dropdown
  const eventTypes = Array.from(new Set([
    ...events.map(e => {
      const parts = e.type.split(':');
      return parts[0] + (parts.length > 1 ? ':*' : '');
    }),
    // A filter from the URL stays selectable before its first event arrives
    ...(filter !== 'all' ? [filter] : []),
  ]));

  function togglePause() {
    const next = !paused;
    pausedRef.current = next;
    setPaused(next);
    if (!next && held.length > 0) {
      setEvents(prev => [...prev, ...held].slice(-MAX_EVENTS));
      setHeld([]);
    }
  }

  const search = text.trim().toLowerCase();
  const filteredEvents = events.filter(ev => {
    if (search && !ev.type.toLowerCase().includes(search) && !ev.payload.toLowerCase().includes(search)) return false;
    if (filter === 'all') return true;
    // `job:*` matches `job:` + anything (not `jobs...`); other filters are exact types
    if (filter.endsWith(':*')) return ev.type.startsWith(filter.slice(0, -1));
    return ev.type === filter;
  });

  const clientColumns = [
    {
      key: 'id',
      header: t('events.colId'),
      render: (c: WsClientInfo) => (
        <span className="font-mono text-xs text-muted">{c.id.slice(0, 12)}...</span>
      ),
    },
    {
      key: 'type',
      header: t('events.colType'),
      render: (c: WsClientInfo) => (
        <Badge variant={clientTypeBadgeVariant(c.type)}>{c.type}</Badge>
      ),
    },
    {
      key: 'connectedAt',
      header: t('events.colConnected'),
      render: (c: WsClientInfo) => (
        <span className="text-xs text-muted">{formatDate(c.connectedAt, { timeStyle: 'medium' })}</span>
      ),
    },
    {
      key: 'remoteAddress',
      header: t('events.colRemote'),
      render: (c: WsClientInfo) => (
        <span className="font-mono text-xs text-muted">{c.remoteAddress}</span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.events')}
        subtitle={t('events.subtitle')}
      />

      <div className="p-6">
        <div className="flex gap-4 h-[calc(100vh-12rem)]">
          {/* Left panel: Live events */}
          <ErrorBoundary label={t('events.liveEvents')} resetKeys={[events, filter]}>
          <div className="flex-[2] flex flex-col bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border/75 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-heading">{t('events.liveEvents')}</span>
              <span className="text-xs text-subtle">{t('events.shown', { shown: events.length, max: MAX_EVENTS })}</span>

              <input
                type="search"
                value={text}
                onChange={e => setParam('q', e.target.value || null)}
                placeholder={t('events.search')}
                aria-label={t('events.search')}
                className="ml-auto w-40 text-xs bg-control border border-border text-text rounded px-2 py-1 placeholder-subtle focus:outline-none"
              />

              <select
                value={filter}
                onChange={e => setFilter(e.target.value)}
                aria-label={t('events.filterLabel')}
                title={t('events.filterLabel')}
                className="text-xs bg-control border border-border text-text rounded px-2 py-1 focus:outline-none"
              >
                <option value="all">{t('events.allTypes')}</option>
                {eventTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>

              <button
                onClick={togglePause}
                aria-pressed={paused}
                className={`text-[10px] px-2 py-0.5 rounded ${paused ? 'bg-warning/20 text-warning' : 'bg-control text-muted hover:bg-control-hover'}`}
              >
                {paused ? t('events.resumeHeld', { count: held.length }) : t('events.pause')}
              </button>

              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`text-[10px] px-2 py-0.5 rounded ${autoScroll ? 'bg-primary/20 text-accent' : 'bg-control text-muted'}`}
              >
                {autoScroll ? t('events.autoScrollOn') : t('events.autoScrollOff')}
              </button>

              <button
                onClick={() => { setEvents([]); setHeld([]); }}
                className="text-[10px] px-2 py-0.5 rounded bg-error/20 text-error hover:bg-error/30 transition-colors"
              >
                {t('events.clear')}
              </button>
            </div>

            <div
              ref={eventListRef}
              onScroll={() => {
                if (!eventListRef.current) return;
                const { scrollTop, scrollHeight, clientHeight } = eventListRef.current;
                setAutoScroll(scrollHeight - scrollTop - clientHeight < 60);
              }}
              className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-0.5"
            >
              {filteredEvents.length === 0 ? (
                <div className="text-subtle py-4 text-center">{t('events.waiting')}</div>
              ) : (
                filteredEvents.map(ev => (
                  <div key={ev.id} className="flex items-start gap-2 py-0.5 hover:bg-surface/75 rounded px-1">
                    <span className="text-subtle shrink-0">[{formatDate(ev.time, { timeStyle: 'medium' })}]</span>
                    <Badge variant={eventTypeBadgeVariant(ev.type)}>{ev.type}</Badge>
                    <span className="text-muted truncate flex-1 text-[10px]">{ev.payload}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          </ErrorBoundary>

          {/* Right panel: Connected clients */}
          <ErrorBoundary label={t('events.connectedClients')} resetKeys={[clients]}>
          <div className="flex-1 flex flex-col">
            <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col h-full">
              <div className="px-4 py-3 border-b border-border/75 flex items-center justify-between">
                <span className="text-sm font-medium text-heading">{t('events.connectedClients')}</span>
                <div className="flex items-center gap-2">
                  {clients && (
                    <span className="text-xs text-subtle">{t('events.connectedCount', { count: clients.length })}</span>
                  )}
                  <button
                    onClick={refetchClients}
                    className="text-[10px] px-2 py-0.5 rounded bg-control text-muted hover:bg-control-hover transition-colors"
                  >
                    {t('common.refresh')}
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {clientsLoading ? (
                  <div className="p-4 text-muted text-sm">{t('common.loading')}</div>
                ) : clients && clients.length > 0 ? (
                  <DataTable
                    columns={clientColumns}
                    data={clients}
                    keyExtractor={c => c.id}
                  />
                ) : (
                  <div className="p-4 text-subtle text-sm">{t('events.noClients')}</div>
                )}
              </div>
            </div>
          </div>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
