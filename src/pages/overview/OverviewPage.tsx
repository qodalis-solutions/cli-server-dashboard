import ErrorBoundary from '../../components/ErrorBoundary';
import Select from '../../components/Select';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import StatCard from '../../components/StatCard';
import PageHeader from '../../components/PageHeader';
import MonoPanel from '../../components/MonoPanel';
import { useApi } from '../../hooks/useApi';
import { useWebSocket } from '../../context/WebSocketContext';
import { getStatus } from '../../api/status';
import { getCapabilities } from '../../api/status';
import type { CapabilitiesResponse } from '../../types';
import { getLogs } from '../../api/logs';
import { useStatusHistory } from './useStatusHistory';
import { eventText } from '../events/eventSummary';
import { extensionPath, extensionTitle } from '../../components/navItems';
import { cardsOf, ExtensionCard, PendingModuleCards, useModuleAttention, useOverviewModulesState } from './OverviewExtensions';

/** Minutes of resource history the page can show. */
const HISTORY_RANGES = [60, 360, 1440] as const;
import { useI18n, type MessageKey, type MessageParams } from '../../i18n';
import { ErrorState, LineChart, Skeleton, SkeletonGroup, SkeletonList, SkeletonStatCards } from '@qodalis/cli-server-dashboard-kit';

type Translate = (key: MessageKey, params?: MessageParams) => string;

function formatUptime(seconds: number, t: Translate): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return t('overview.uptimeDays', { days, hours });
  if (hours > 0) return t('overview.uptimeHours', { hours, minutes });
  return t('overview.uptimeMinutes', { minutes });
}

function formatTimestamp(time: Date): string {
  return time.toISOString().replace('T', ' ').slice(0, 19);
}

/** Lines kept in the activity panel. */
const MAX_EVENT_LINES = 100;

export default function OverviewPage() {
  const { t, formatDate, formatNumber, locale } = useI18n();
  const { data: status, loading: statusLoading } = useApi(getStatus, []);
  const { data: caps, loading: capsLoading, refetch: refetchCaps } = useApi(getCapabilities, []);
  // Cards and attention items of the plugins' modules (widgets: ["overview"])
  const { modules, loading: modulesLoading, pending: pendingModules } = useOverviewModulesState();
  const { items: moduleAttention, collectors, pending: attentionPending } = useModuleAttention(modules);

  const [historyMinutes, setHistoryMinutes] = useState<(typeof HISTORY_RANGES)[number]>(60);
  const { history, failed: historyFailed } = useStatusHistory(historyMinutes);
  const sampleTimes = history?.samples.map(s => Date.parse(s.timestamp)) ?? [];

  // Needs attention: what the modules report, and the latest errors in the log
  const { data: errorLogs, loading: errorLogsLoading } = useApi(() => getLogs({ level: 'ERROR', limit: 5 }), []);
  // A server that does not filter sends every level: keep its errors
  const recentErrors = (Array.isArray(errorLogs?.entries) ? errorLogs.entries : []).filter(e => e.level === 'ERROR').slice(0, 5);

  // Activity: one readable line per event (log entries have their own page); described when shown, so a language
  // change applies to the lines already there
  const [events, setEvents] = useState<{ time: Date; event: Record<string, unknown> }[]>([]);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsub = subscribe('*', (event) => {
      if (String(event.type ?? '').startsWith('log:')) return;
      setEvents(prev => [...prev.slice(-(MAX_EVENT_LINES - 1)), { time: new Date(), event }]);
    });
    return unsub;
  }, [subscribe]);
  const eventLines = events.map(({ time, event }) => {
    const line = eventText(event, t) ?? `${String(event.type ?? 'unknown')} ${JSON.stringify(event)}`;
    return `[${formatTimestamp(time)}] ${line}`;
  });

  const uptime = typeof status?.uptimeSeconds === 'number' ? formatUptime(status.uptimeSeconds, t) : '—';
  const commandCount = status ? formatNumber(status.registeredCommands) : '—';
  const wsClients = status ? formatNumber(status.activeWsConnections) : '—';


  return (
    <div>
      <PageHeader
        title={t('nav.overview')}
        subtitle={t('overview.subtitle')}
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Stat Cards */}
        <div className="flex flex-wrap gap-4">
          {statusLoading && !status ? <SkeletonStatCards count={3} inRow /> : <>
          <StatCard
            label={t('overview.uptime')}
            value={uptime}
            sub={status ? t('overview.since', { date: formatDate(status.startedAt) }) : undefined}
          />
          <StatCard
            label={t('nav.commands')}
            value={commandCount}
            sub={t('overview.registeredProcessors')}
          />
          <StatCard
            label={t('overview.wsClients')}
            value={wsClients}
            sub={t('overview.activeConnections')}
          />
          </>}
          {cardsOf(modules, 'stat').map(({ module, card }) => (
            <ExtensionCard key={`${module.extension.id}:${card.id}`} module={module} card={card} />
          ))}
        </div>
        {collectors}

        {/* Server Info Panel */}
        <ErrorBoundary label={t('overview.serverInfo')} resetKeys={[caps]}>
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-heading mb-3">{t('overview.serverInfo')}</h3>
          {capsLoading && !caps ? (
            <SkeletonGroup className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3.5 py-0.5">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </SkeletonGroup>
          ) : caps ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-subtle">{t('overview.os')}</span>
                <span className="text-text font-mono text-xs">{caps.os ?? status?.os ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-subtle">{t('overview.platform')}</span>
                <span className="text-text font-mono text-xs">{caps.platform ?? status?.platform ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-subtle">{t('overview.shell')}</span>
                <span className="text-text font-mono text-xs">{shellLabel(caps, t)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-subtle">{t('overview.version')}</span>
                <span className="text-text font-mono text-xs">{caps.version ?? status?.platformVersion ?? '—'}</span>
              </div>
              {status && (
                <>
                  <div className="flex justify-between">
                    <span className="text-subtle">{t('overview.memory')}</span>
                    <span className="text-text font-mono text-xs">{formatNumber(status.memoryUsageMb, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-subtle">{t('overview.shellSessions')}</span>
                    <span className="text-text font-mono text-xs">{formatNumber(status.activeShellSessions)}</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <ErrorState compact title={t('overview.serverInfoFailed')} onRetry={refetchCaps} />
          )}
        </div>
        </ErrorBoundary>

        {/* Resources over time: its place is held (same height) until the first samples arrive */}
        {!history && !historyFailed && <ResourcesSkeleton />}
        {history && history.samples.length > 0 && (
          <ErrorBoundary label={t('overview.resources')} resetKeys={[history]}>
            <section className="bg-surface border border-border rounded-xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-heading">{t('overview.resources')}</h3>
                  <div className="text-[11px] text-subtle mt-0.5">
                    {history.source === 'server' ? t('overview.resourcesNote') : t('overview.resourcesLocal')}
                  </div>
                </div>
                {history.source === 'server' && (
                  <Select
                    label={t('overview.resources')}
                    width="auto"
                    options={HISTORY_RANGES.map(m => ({ value: String(m), label: t(m === 60 ? 'common.range_1h' : m === 360 ? 'overview.range_6h' : 'common.range_24h') }))}
                    value={String(historyMinutes)}
                    onChange={m => setHistoryMinutes(Number(m) as (typeof HISTORY_RANGES)[number])}
                  />
                )}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {([
                  { key: 'memory', label: t('overview.memory'), values: history.samples.map(s => s.memoryMb), format: (v: number) => `${formatNumber(v, { maximumFractionDigits: v < 10 ? 1 : 0 })} MB`, minMax: 0 },
                  { key: 'cpu', label: t('overview.cpu'), values: history.samples.map(s => s.cpuPercent), format: (v: number) => `${formatNumber(v, { maximumFractionDigits: 1 })}%`, minMax: 10 },
                  { key: 'ws', label: t('overview.wsClients'), values: history.samples.map(s => s.activeWsConnections), format: (v: number) => formatNumber(v, { maximumFractionDigits: 0 }), minMax: 2 },
                ] as const).filter(chart => chart.values.some(v => v !== null && v !== undefined)).map(chart => {
                  const latest = [...chart.values].reverse().find(v => v !== null && v !== undefined);
                  return (
                    <div key={chart.key}>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-xs text-muted">{chart.label}</span>
                        <span className="text-sm font-semibold text-heading">{latest !== undefined && latest !== null ? chart.format(latest) : '—'}</span>
                      </div>
                      <LineChart
                        times={sampleTimes}
                        series={[{ key: chart.key, label: chart.label, color: 'var(--qcli-primary)', values: chart.values.map(v => v ?? null) }]}
                        formatValue={chart.format}
                        formatTime={time => formatDate(time, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        formatTick={time => formatDate(time, { hour: '2-digit', minute: '2-digit' })}
                        minMax={chart.minMax}
                        integer={chart.key === 'ws'}
                        height={100}
                        ariaLabel={chart.label}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          </ErrorBoundary>
        )}

        {/* Needs attention */}
        <ErrorBoundary label={t('overview.attention')} resetKeys={[moduleAttention, errorLogs]}>
          <section className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border/75">
              <span className="text-sm font-medium text-heading">{t('overview.attention')}</span>
            </div>
            {moduleAttention.length === 0 && recentErrors.length === 0 && (errorLogsLoading || modulesLoading || attentionPending) ? (
              <SkeletonList items={2} className="px-4 py-3.5" />
            ) : moduleAttention.length === 0 && recentErrors.length === 0 ? (
              <div className="px-4 py-4 text-sm text-success flex items-center gap-2">
                <span aria-hidden>✓</span>{t('overview.allClear')}
              </div>
            ) : (
              <ul className="divide-y divide-border/50">
                {moduleAttention.slice(0, 10).map(item => (
                  <li key={`${item.extension.id}:${item.id}`}>
                    <Link
                      to={`${extensionPath(item.extension.id)}${item.path ?? ''}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-control text-sm"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${item.level === 'error' ? 'bg-error' : 'bg-warning'}`} aria-hidden />
                      <span className="text-text truncate">{item.title}</span>
                      {item.detail && <span className={`text-xs truncate ${item.level === 'error' ? 'text-error' : 'text-warning'}`}>{item.detail}</span>}
                      <span className="ml-auto text-xs text-subtle whitespace-nowrap">
                        {extensionTitle(item.extension, locale)}
                        {item.time ? ` · ${formatDate(item.time, { hour: '2-digit', minute: '2-digit' })}` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
                {recentErrors.map((entry, i) => (
                  <li key={`${entry.timestamp}-${i}`}>
                    <Link to="/logs?level=ERROR" className="flex items-center gap-3 px-4 py-2.5 hover:bg-control text-sm">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-error/15 text-error shrink-0">ERROR</span>
                      <span className="text-text truncate">{entry.message}</span>
                      <span className="ml-auto text-xs text-subtle whitespace-nowrap">{formatDate(entry.timestamp, { hour: '2-digit', minute: '2-digit' })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </ErrorBoundary>

        {/* The modules' panels: half cards two by two on wide screens, full cards across */}
        {(cardsOf(modules, 'half').length > 0 || cardsOf(modules, 'full').length > 0 || pendingModules > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[...cardsOf(modules, 'full'), ...cardsOf(modules, 'half')].map(({ module, card }) => (
              <ExtensionCard key={`${module.extension.id}:${card.id}`} module={module} card={card} />
            ))}
            <PendingModuleCards count={pendingModules} />
          </div>
        )}

        {/* Live Events */}
        <MonoPanel
          title={t('overview.liveEvents')}
          lines={eventLines.length > 0 ? eventLines : [t('overview.waitingForEvents')]}
          maxLines={MAX_EVENT_LINES}
        />
      </div>
    </div>
  );
}

/** Place of the resource charts (header and three 100px charts) while the first samples load. */
function ResourcesSkeleton() {
  return (
    <SkeletonGroup className="bg-surface border border-border rounded-xl p-4">
      <Skeleton className="h-3.5 w-36" />
      <Skeleton className="h-2.5 w-56 max-w-full mt-1.5 mb-4" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => (
          <div key={i}>
            <div className="flex justify-between mb-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3.5 w-12" />
            </div>
            <Skeleton className="h-[100px] w-full rounded-md" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

function shellLabel(caps: CapabilitiesResponse, t: Translate): string {
  if (caps.shell === false || caps.shell == null) return t('common.disabled');
  const path = typeof caps.shell === 'string' ? caps.shell : caps.shellPath ?? t('common.enabled');
  return caps.shellAuth ? `${path} (${caps.shellAuth})` : path;
}
