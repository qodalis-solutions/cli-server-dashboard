import ErrorBoundary from '../../components/ErrorBoundary';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
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

function formatTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export default function OverviewPage() {
  const { t, formatDate, formatNumber } = useI18n();
  const { data: status, loading: statusLoading } = useApi(getStatus, []);
  const { data: caps, loading: capsLoading } = useApi(getCapabilities, []);
  const { hasFeature } = useFeatures();
  const { data: jobs } = useApi(hasFeature('jobs') ? getJobs : () => Promise.resolve([]), [hasFeature('jobs')]);

  const [eventLines, setEventLines] = useState<string[]>([]);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    const unsub = subscribe('*', (event) => {
      const type = (event.type as string) ?? 'unknown';
      const payload = JSON.stringify(event);
      setEventLines(prev => [...prev.slice(-99), `[${formatTimestamp()}] ${type} ${payload}`]);
    });
    return unsub;
  }, [subscribe]);

  const uptime = typeof status?.uptimeSeconds === 'number' ? formatUptime(status.uptimeSeconds, t) : '—';
  const commandCount = status ? formatNumber(status.registeredCommands) : '—';
  const activeJobs = status ? formatNumber(status.registeredJobs) : '—';
  const wsClients = status ? formatNumber(status.activeWsConnections) : '—';

  // Show last 5 jobs as a proxy for "recent" (jobs API doesn't return executions directly)
  const recentJobs = jobs ? jobs.slice(0, 5) : null;

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

        {/* Recent Jobs */}
        <ErrorBoundary label={t('overview.recentJobs')} resetKeys={[jobs]}>
        {hasFeature('jobs') && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border/75 flex items-center justify-between">
            <span className="text-sm font-medium text-heading">{t('overview.recentJobs')}</span>
            <Link to="/jobs" className="text-xs text-accent hover:text-accent transition-colors">{t('overview.viewAll')}</Link>
          </div>
          {recentJobs === null ? (
            <div className="px-4 py-4 text-sm text-muted">{t('overview.noJobData')}</div>
          ) : recentJobs.length === 0 ? (
            <div className="px-4 py-4 text-sm text-muted">{t('overview.noJobs')}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-subtle uppercase tracking-wide border-b border-border/50">
                  <th className="text-left px-4 py-2 font-medium">{t('overview.colName')}</th>
                  <th className="text-left px-4 py-2 font-medium">{t('overview.colGroup')}</th>
                  <th className="text-left px-4 py-2 font-medium">{t('overview.colStatus')}</th>
                  <th className="text-left px-4 py-2 font-medium">{t('overview.colLastRun')}</th>
                  <th className="text-left px-4 py-2 font-medium">{t('overview.colNextRun')}</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map(job => (
                  <tr key={job.id} className="border-b border-border/50 hover:bg-surface/50 transition-colors">
                    <td className="px-4 py-2 text-text">{job.name}</td>
                    <td className="px-4 py-2 text-muted">{job.group}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        job.status === 'active' || job.status === 'running'
                          ? 'bg-success/20 text-success'
                          : job.status === 'paused'
                          ? 'bg-warning/20 text-warning'
                          : job.status === 'stopped' || job.status === 'failed'
                          ? 'bg-error/20 text-error'
                          : 'bg-subtle/20 text-muted'
                      }`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted text-xs font-mono">
                      {job.lastRunAt ? formatDate(job.lastRunAt) : '—'}
                    </td>
                    <td className="px-4 py-2 text-muted text-xs font-mono">
                      {job.nextRunAt ? formatDate(job.nextRunAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        )}
        </ErrorBoundary>

        {/* Live Events */}
        <MonoPanel
          title={t('overview.liveEvents')}
          lines={eventLines.length > 0 ? eventLines : [t('overview.waitingForEvents')]}
          maxLines={100}
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
