import ErrorBoundary from '../../components/ErrorBoundary';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import StatCard from '../../components/StatCard';
import PageHeader from '../../components/PageHeader';
import MonoPanel from '../../components/MonoPanel';
import { useApi } from '../../hooks/useApi';
import { useWebSocket } from '../../context/WebSocketContext';
import { useFeatures } from '../../context/FeaturesContext';
import { getStatus } from '../../api/status';
import { getCapabilities } from '../../api/status';
import type { CapabilitiesResponse } from '../../types';
import { getJobs } from '../../api/jobs';
import ColumnChart from '../../components/charts/ColumnChart';
import { ChartCard, ChartLegend } from '../../components/charts/chartParts';
import { spreadTicks } from '../../components/charts/chartUtils';
import { OUTCOMES, OUTCOME_COLORS } from '../jobs/jobInsights';
import { useJobInsights } from '../jobs/useJobInsights';
import { getLogs } from '../../api/logs';
import LineChart from '../../components/charts/LineChart';
import { useStatusHistory } from './useStatusHistory';
import { eventText } from '../events/eventSummary';

/** Minutes of resource history the page can show. */
const HISTORY_RANGES = [60, 360, 1440] as const;
import { useI18n, type MessageKey, type MessageParams } from '../../i18n';

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
  const { t, formatDate, formatNumber } = useI18n();
  const { data: status, loading: statusLoading } = useApi(getStatus, []);
  const { data: caps, loading: capsLoading } = useApi(getCapabilities, []);
  const { hasFeature } = useFeatures();
  const { data: jobs } = useApi(hasFeature('jobs') ? getJobs : () => Promise.resolve([]), [hasFeature('jobs')]);

  const navigate = useNavigate();
  const { insights, reloading: insightsReloading } = useJobInsights('24h', hasFeature('jobs'));
  const runBuckets = insights?.buckets ?? [];
  const runTotals = insights?.stats ?? null;

  const [historyMinutes, setHistoryMinutes] = useState<(typeof HISTORY_RANGES)[number]>(60);
  const history = useStatusHistory(historyMinutes);
  const sampleTimes = history?.samples.map(s => Date.parse(s.timestamp)) ?? [];

  // Needs attention: jobs that failed in the last 24 hours, and the latest errors in the log
  const failingJobs = insights
    ? [...insights.jobs.entries()]
      .map(([jobId, summary]) => ({ jobId, summary }))
      .filter(job => job.summary.successRate !== null && job.summary.successRate < 1)
      .sort((a, b) => (a.summary.successRate ?? 1) - (b.summary.successRate ?? 1))
      .slice(0, 5)
    : [];
  const { data: errorLogs } = useApi(() => getLogs({ level: 'ERROR', limit: 5 }), []);
  // A server that does not filter sends every level: keep its errors
  const recentErrors = (Array.isArray(errorLogs?.entries) ? errorLogs.entries : []).filter(e => e.level === 'ERROR').slice(0, 5);
  const jobNames = new Map((jobs ?? []).map(j => [j.id, j.name]));

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
    const jobName = typeof event.jobId === 'string' ? jobNames.get(event.jobId) : undefined;
    const line = eventText(jobName ? { ...event, jobName } : event, t) ?? `${String(event.type ?? 'unknown')} ${JSON.stringify(event)}`;
    return `[${formatTimestamp(time)}] ${line}`;
  });

  const uptime = typeof status?.uptimeSeconds === 'number' ? formatUptime(status.uptimeSeconds, t) : '—';
  const commandCount = status ? formatNumber(status.registeredCommands) : '—';
  const activeJobs = status ? formatNumber(status.registeredJobs) : '—';
  const wsClients = status ? formatNumber(status.activeWsConnections) : '—';


  return (
    <div>
      <PageHeader
        title={t('nav.overview')}
        subtitle={t('overview.subtitle')}
      />

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="flex gap-4">
          <StatCard
            label={t('overview.uptime')}
            value={uptime}
            sub={statusLoading ? t('common.loading') : status ? t('overview.since', { date: formatDate(status.startedAt) }) : undefined}
          />
          <StatCard
            label={t('nav.commands')}
            value={commandCount}
            sub={t('overview.registeredProcessors')}
          />
          {hasFeature('jobs') && (
          <StatCard
            label={t('overview.activeJobs')}
            value={activeJobs}
            sub={t('overview.registeredJobs')}
          />
          )}
          <StatCard
            label={t('overview.wsClients')}
            value={wsClients}
            sub={t('overview.activeConnections')}
          />
        </div>

        {/* Server Info Panel */}
        <ErrorBoundary label={t('overview.serverInfo')} resetKeys={[caps]}>
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-heading mb-3">{t('overview.serverInfo')}</h3>
          {capsLoading ? (
            <p className="text-muted text-sm">{t('common.loading')}</p>
          ) : caps ? (
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
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
            <p className="text-muted text-sm">{t('overview.serverInfoFailed')}</p>
          )}
        </div>
        </ErrorBoundary>

        {/* Resources over time */}
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
                  <select
                    aria-label={t('overview.resources')}
                    value={historyMinutes}
                    onChange={e => setHistoryMinutes(Number(e.target.value) as (typeof HISTORY_RANGES)[number])}
                    className="px-3 py-1.5 text-xs bg-control border border-border/75 rounded-lg text-text"
                  >
                    {HISTORY_RANGES.map(m => <option key={m} value={m}>{t(m === 60 ? 'common.range_1h' : m === 360 ? 'overview.range_6h' : 'common.range_24h')}</option>)}
                  </select>
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
        <ErrorBoundary label={t('overview.attention')} resetKeys={[insights, errorLogs]}>
          <section className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border/75">
              <span className="text-sm font-medium text-heading">{t('overview.attention')}</span>
            </div>
            {failingJobs.length === 0 && recentErrors.length === 0 ? (
              <div className="px-4 py-4 text-sm text-success flex items-center gap-2">
                <span aria-hidden>✓</span>{t('overview.allClear')}
              </div>
            ) : (
              <ul className="divide-y divide-border/50">
                {failingJobs.map(job => (
                  <li key={job.jobId}>
                    <Link to={`/jobs/${encodeURIComponent(job.jobId)}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-control text-sm">
                      <span className="w-2 h-2 rounded-full bg-error shrink-0" aria-hidden />
                      <span className="text-text">{jobNames.get(job.jobId) ?? job.jobId}</span>
                      <span className="text-xs text-error">
                        {t('overview.jobFailing', { rate: formatNumber(job.summary.successRate ?? 0, { style: 'percent', maximumFractionDigits: 1 }) })}
                      </span>
                      <span className="ml-auto text-xs text-subtle">{t('overview.inLast24h')}</span>
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

        {/* Job runs, last 24 hours */}
        {insights && runTotals && (
          <ErrorBoundary label={t('jobs.runsChart')} resetKeys={[insights]}>
            <ChartCard
              title={`${t('jobs.runsChart')} · ${t('jobs.range_24h')}`}
              note={runTotals.successRate !== null
                ? `${t('jobs.successRate')}: ${formatNumber(runTotals.successRate, { style: 'percent', maximumFractionDigits: 1 })}`
                : undefined}
              legend={<ChartLegend items={OUTCOMES.map(o => ({ label: t(`jobs.outcome_${o}`), color: OUTCOME_COLORS[o], value: formatNumber(runTotals[o]) }))} />}
              actions={<Link to="/jobs" className="text-xs text-accent hover:text-accent transition-colors">{t('overview.viewAll')}</Link>}
            >
              <ColumnChart
                columns={runBuckets.map(bucket => ({
                  key: String(bucket.start),
                  segments: OUTCOMES.map(o => ({ key: o, value: bucket.counts[o], color: OUTCOME_COLORS[o] })),
                  title: `${formatDate(bucket.start, { hour: '2-digit', minute: '2-digit' })} – ${formatDate(bucket.end, { hour: '2-digit', minute: '2-digit' })}`,
                  rows: OUTCOMES.filter(o => bucket.counts[o] > 0 || o === 'succeeded' || o === 'failed').map(o => ({
                    label: t(`jobs.outcome_${o}`), value: formatNumber(bucket.counts[o]), color: OUTCOME_COLORS[o],
                  })),
                  ariaLabel: t('jobs.columnAria', { time: formatDate(bucket.start), total: bucket.total, failed: bucket.counts.failed }),
                }))}
                xTicks={spreadTicks(runBuckets.length, 6).map(i => ({ index: i, label: formatDate(runBuckets[i].start, { hour: '2-digit', minute: '2-digit' }) }))}
                formatValue={v => formatNumber(v, { notation: 'compact' })}
                integer
                height={140}
                onSelect={key => key && navigate(`/jobs?at=${key}`)}
                stale={insightsReloading}
                ariaLabel={t('jobs.runsChart')}
              />
            </ChartCard>
          </ErrorBoundary>
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

function shellLabel(caps: CapabilitiesResponse, t: Translate): string {
  if (caps.shell === false || caps.shell == null) return t('common.disabled');
  const path = typeof caps.shell === 'string' ? caps.shell : caps.shellPath ?? t('common.enabled');
  return caps.shellAuth ? `${path} (${caps.shellAuth})` : path;
}
