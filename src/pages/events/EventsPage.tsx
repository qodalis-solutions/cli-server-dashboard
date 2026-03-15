import { useEffect, useRef, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import DataTable from '../../components/DataTable';
import { useWebSocket } from '../../context/WebSocketContext';
import { useApi } from '../../hooks/useApi';
import { getWsClients } from '../../api/events';
import type { WsClientInfo } from '../../types';

interface LiveEvent {
  id: number;
  time: string;
  type: string;
  payload: string;
}

let eventCounter = 0;

function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 8);
}

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
  const { subscribe } = useWebSocket();
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [filter, setFilter] = useState('all');
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
        time: formatTime(new Date()),
        type,
        payload: JSON.stringify(event),
      };
      setEvents(prev => {
        const next = [...prev, newEvent];
        return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
      });
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
  const eventTypes = Array.from(new Set(events.map(e => {
    const parts = e.type.split(':');
    return parts[0] + (parts.length > 1 ? ':*' : '');
  })));

  const filteredEvents = events.filter(ev => {
    if (filter === 'all') return true;
    const prefix = filter.replace(':*', '');
    return ev.type.startsWith(prefix);
  });

  const clientColumns = [
    {
      key: 'id',
      header: 'ID',
      render: (c: WsClientInfo) => (
        <span className="font-mono text-xs text-slate-400">{c.id.slice(0, 12)}...</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (c: WsClientInfo) => (
        <Badge variant={clientTypeBadgeVariant(c.type)}>{c.type}</Badge>
      ),
    },
    {
      key: 'connectedAt',
      header: 'Connected',
      render: (c: WsClientInfo) => (
        <span className="text-xs text-slate-400">{new Date(c.connectedAt).toLocaleTimeString()}</span>
      ),
    },
    {
      key: 'remoteAddress',
      header: 'Remote',
      render: (c: WsClientInfo) => (
        <span className="font-mono text-xs text-slate-400">{c.remoteAddress}</span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Events"
        subtitle="Live event stream and connected clients"
      />

      <div className="p-6">
        <div className="flex gap-4 h-[calc(100vh-12rem)]">
          {/* Left panel: Live events */}
          <div className="flex-[2] flex flex-col bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-white">Live Events</span>
              <span className="text-xs text-slate-500">{events.length} / {MAX_EVENTS}</span>

              <select
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="ml-auto text-xs bg-white/[0.06] border border-white/[0.1] text-slate-300 rounded px-2 py-1 focus:outline-none"
              >
                <option value="all">All types</option>
                {eventTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`text-[10px] px-2 py-0.5 rounded ${autoScroll ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/[0.06] text-slate-400'}`}
              >
                {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
              </button>

              <button
                onClick={() => setEvents([])}
                className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                Clear
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
                <div className="text-slate-500 py-4 text-center">Waiting for events...</div>
              ) : (
                filteredEvents.map(ev => (
                  <div key={ev.id} className="flex items-start gap-2 py-0.5 hover:bg-white/[0.03] rounded px-1">
                    <span className="text-slate-600 shrink-0">[{ev.time}]</span>
                    <Badge variant={eventTypeBadgeVariant(ev.type)}>{ev.type}</Badge>
                    <span className="text-slate-400 truncate flex-1 text-[10px]">{ev.payload}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right panel: Connected clients */}
          <div className="flex-1 flex flex-col">
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden flex flex-col h-full">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <span className="text-sm font-medium text-white">Connected Clients</span>
                <div className="flex items-center gap-2">
                  {clients && (
                    <span className="text-xs text-slate-500">{clients.length} connected</span>
                  )}
                  <button
                    onClick={refetchClients}
                    className="text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-slate-400 hover:bg-white/[0.1] transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                {clientsLoading ? (
                  <div className="p-4 text-slate-400 text-sm">Loading...</div>
                ) : clients && clients.length > 0 ? (
                  <DataTable
                    columns={clientColumns}
                    data={clients}
                    keyExtractor={c => c.id}
                  />
                ) : (
                  <div className="p-4 text-slate-500 text-sm">No clients connected.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
