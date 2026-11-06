import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import DataTable from '../../components/DataTable';
import MonoPanel from '../../components/MonoPanel';
import StatCard from '../../components/StatCard';
import ColumnChart, { type Column } from '../../components/charts/ColumnChart';
import { ChartCard, ChartLegend } from '../../components/charts/chartParts';
import { useLiveReload } from '../../hooks/useLiveReload';
import { useApi } from '../../hooks/useApi';
import { getJob, getJobHistory, getJobExecution, triggerJob, pauseJob, resumeJob, stopJob, cancelJob, deleteJobRun, deleteJobRuns, offers, formatSpan } from '../../api/jobs';
import JobEditModal from './JobEditModal';
import RunDetailsModal from './RunDetailsModal';
import { runLogLine, type RunSummary } from './runDetails';
import type { JobExecutionDto } from '../../types';
import { formatProperties } from '../../api/audit';
import { useI18n } from '../../i18n';
import { JOB_OVERLAP_POLICIES, JOB_STATUSES, JOB_TRIGGER_TYPES } from '../../i18n/messages/jobs';
import { OUTCOMES, OUTCOME_COLORS, outcomeOf, runStats, shortDuration } from './jobInsights';

/** Runs in the duration chart and its stats. */
const CHART_RUNS = 50;
/** Statuses every server filters its history by. */
const HISTORY_STATUSES = ['completed', 'failed', 'cancelled', 'running'] as const;

const isOneOf = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

function jobStatusVariant(status: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  switch (status) {
    case 'active':
    case 'running':
    case 'completed':
    case 'succeeded':
      return 'success';
    case 'paused':
      return 'warning';
    case 'stopped':
    case 'failed':
    case 'error':
      return 'error';
    case 'scheduled':
      return 'info';
    default:
      return 'neutral';
  }
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, formatDate: formatDateTime, formatNumber, formatRelative } = useI18n();
  const [page, setPage] = useState(0);
  const [historyStatus, setHistoryStatus] = useState('');
  const pageSize = 20;
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: job, loading: jobLoading, refetch: refetchJob, refresh: refreshJob } = useApi(
    () => getJob(id!),
    [id]
  );

  const { data: history, loading: historyLoading, refetch: refetchHistory, refresh: refreshHistory } = useApi(
    () => getJobHistory(id!, { limit: pageSize, offset: page * pageSize, status: historyStatus || undefined }),
    [id, page, historyStatus]
  );

  const { data: recent, loading: recentLoading, refetch: refetchRecent, refresh: refreshRecent } = useApi(
    () => getJobHistory(id!, { limit: CHART_RUNS }),
    [id]
  );


  // Oldest on the left
  const chartRuns = recent ? [...recent.items].reverse() : [];
  const stats = runStats(chartRuns);
  const lastFailure = recent?.items.find(run => outcomeOf(run.status) === 'failed');
  const percent = (value: number | null) => (value === null ? '—' : formatNumber(value, { style: 'percent', maximumFractionDigits: 1 }));

  const formatDate = (iso: string | null) => (iso ? formatDateTime(iso) : '—');
  const formatDuration = (ms: number | null | undefined) => {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
    if (ms < 1000) return formatNumber(ms, { style: 'unit', unit: 'millisecond', unitDisplay: 'narrow' });
    return formatNumber(ms / 1000, { style: 'unit', unit: 'second', unitDisplay: 'narrow', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const statusLabel = (status: string) => (isOneOf(JOB_STATUSES, status) ? t(`jobs.status_${status}`) : status);
  const triggerLabel = (type: string) => (isOneOf(JOB_TRIGGER_TYPES, type) ? t(`jobs.trigger_${type}`) : type);
  const overlapLabel = (policy: string) => (isOneOf(JOB_OVERLAP_POLICIES, policy) ? t(`jobs.overlap_${policy}`) : policy);

  const [editing, setEditing] = useState(false);
  // Any event of this job (a run, a state change, new options, deleted runs): reload what shows it, quietly.
  // Not while its settings are being edited: the form compares against the job it opened with.
  useLiveReload('job:*', () => { refreshJob(); refreshHistory(); refreshRecent(); }, {
    filter: event => event.jobId === id,
    paused: editing,
  });
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [detailsRun, setDetailsRun] = useState<RunSummary | null>(null);
  const showDetails = (exec: JobExecutionDto) => setDetailsRun({ ...exec, jobId: exec.jobId || id! });
  const canDeleteRuns = offers(job, 'delete-runs');
  const running = !!job && (job.status === 'running' || !!job.currentExecutionId);

  async function handleAction(action: 'trigger' | 'pause' | 'resume' | 'stop' | 'cancel') {
    if (!id) return;
    if (action === 'cancel' && !window.confirm(t('jobs.cancelRunConfirm'))) return;
    setActionError(null);
    try {
      if (action === 'cancel') await cancelJob(id);
      else if (action === 'trigger') await triggerJob(id);
      else if (action === 'pause') await pauseJob(id);
      else if (action === 'resume') await resumeJob(id);
      else if (action === 'stop') await stopJob(id);
      refetchJob();
      refetchHistory();
      refetchRecent();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('jobs.actionFailed'));
    }
  }

  /** The page shows one run fewer (or none of a status): step back when the page would be empty. */
  function afterDelete(removed: number) {
    if (history && page > 0 && history.items.length <= removed) setPage(p => Math.max(0, p - 1));
    else refetchHistory();
    refetchRecent();
    refetchJob();
  }

  async function handleDeleteRun(execution: JobExecutionDto) {
    if (!id || !window.confirm(t('jobs.deleteRunConfirm'))) return;
    setActionError(null);
    setNotice(null);
    try {
      await deleteJobRun(id, execution.id);
      if (selectedRun === execution.id) setSelectedRun(null);
      setLogLines([]);
      afterDelete(1);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('jobs.actionFailed'));
    }
  }

  /** Deletes the runs the status filter shows, or every finished run. */
  async function handleDeleteRuns() {
    if (!id) return;
    const status = historyStatus || undefined;
    const question = status
      ? t('jobs.deleteRunsStatusConfirm', { status: statusLabel(status) })
      : t('jobs.deleteRunsAllConfirm');
    if (!window.confirm(question)) return;
    setActionError(null);
    setNotice(null);
    setDeleting(true);
    try {
      const { deleted } = await deleteJobRuns(id, status);
      setNotice(t('jobs.deletedRuns', { count: deleted }));
      setSelectedRun(null);
      setLogLines([]);
      setPage(0);
      refetchHistory();
      refetchRecent();
      refetchJob();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('jobs.actionFailed'));
    } finally {
      setDeleting(false);
    }
  }

  // Only the last clicked execution may fill the log panel
  const logsRequest = useRef(0);

  async function handleViewLogs(execution: JobExecutionDto) {
    if (!id) return;
    const request = ++logsRequest.current;
    setLogsLoading(true);
    setLogLines([t('jobs.loadingLogsFor', { id: execution.id })]);
    try {
      const exec = await getJobExecution(id, execution.id);
      if (request !== logsRequest.current) return;
      if (exec.logs && exec.logs.length > 0) {
        setLogLines(exec.logs.map(runLogLine));
      } else {
        setLogLines([t('jobs.noLogs')]);
      }
    } catch (err) {
      if (request !== logsRequest.current) return;
      setLogLines([t('jobs.logsError', { message: err instanceof Error ? err.message : t('jobs.unknownError') })]);
    } finally {
      if (request === logsRequest.current) setLogsLoading(false);
    }
  }

  const durationColumns: Column[] = chartRuns.map(run => {
    const outcome = outcomeOf(run.status);
    return {
      key: run.id,
      segments: [{ key: outcome, value: typeof run.duration === 'number' ? run.duration : 0, color: OUTCOME_COLORS[outcome] }],
      title: formatDateTime(run.startedAt),
      rows: [{ label: statusLabel(run.status), value: shortDuration(run.duration), color: OUTCOME_COLORS[outcome] }],
      ariaLabel: `${formatDateTime(run.startedAt)}: ${statusLabel(run.status)}, ${shortDuration(run.duration)}`,
    };
  });
  const logPanel = useRef<HTMLDivElement>(null);

  const execColumns = [
    {
      key: 'id',
      header: t('jobs.id'),
      render: (exec: JobExecutionDto) => (
        <span className="font-mono text-xs text-muted">{exec.id.slice(0, 8)}...</span>
      ),
    },
    {
      key: 'status',
      header: t('jobs.status'),
      sortValue: (exec: JobExecutionDto) => exec.status,
      render: (exec: JobExecutionDto) => (
        <Badge variant={jobStatusVariant(exec.status)} dot>{statusLabel(exec.status)}</Badge>
      ),
    },
    {
      key: 'startedAt',
      header: t('jobs.started'),
      sortValue: (exec: JobExecutionDto) => Date.parse(exec.startedAt),
      render: (exec: JobExecutionDto) => (
        <span className="text-xs text-muted">{formatDate(exec.startedAt)}</span>
      ),
    },
    {
      key: 'duration',
      header: t('jobs.duration'),
      sortValue: (exec: JobExecutionDto) => exec.duration,
      render: (exec: JobExecutionDto) => (
        <span className="text-xs font-mono text-muted">{formatDuration(exec.duration)}</span>
      ),
    },
    {
      key: 'triggerType',
      header: t('jobs.trigger'),
      render: (exec: JobExecutionDto) => (
        <span className="text-xs text-subtle">{exec.triggerType ? triggerLabel(exec.triggerType) : '—'}</span>
      ),
    },
    {
      key: 'properties',
      header: t('jobs.properties'),
      render: (exec: JobExecutionDto) => {
        const values = formatProperties(exec.properties);
        return values.length > 0 ? (
          <div className="flex flex-wrap gap-1 max-w-[260px]">
            {values.map(v => (
              <span key={v} className="font-mono text-[11px] bg-control px-1.5 py-0.5 rounded truncate max-w-[180px]" title={v}>{v}</span>
            ))}
          </div>
        ) : <span className="text-subtle">—</span>;
      },
    },
    {
      key: 'error',
      header: t('jobs.errorColumn'),
      render: (exec: JobExecutionDto) => exec.error ? (
        <button
          onClick={e => { e.stopPropagation(); showDetails(exec); }}
          title={t('jobs.runShowError')}
          className="text-xs text-error truncate max-w-[200px] block text-left hover:underline"
        >
          {exec.error}
        </button>
      ) : <span className="text-subtle">—</span>,
    },
    {
      key: 'logs',
      header: '',
      render: (exec: JobExecutionDto) => (
        <button
          onClick={e => { e.stopPropagation(); handleViewLogs(exec); }}
          className="px-2 py-1 text-[11px] bg-primary/20 hover:bg-primary/30 text-accent rounded transition-colors"
        >
          {t('jobs.logs')}
        </button>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (exec: JobExecutionDto) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={e => { e.stopPropagation(); showDetails(exec); }}
            className="px-2 py-1 text-[11px] bg-control hover:bg-control-hover text-text rounded transition-colors whitespace-nowrap"
          >
            {t('jobs.runDetails')}
          </button>
          {exec.status === 'failed' && offers(job, 'trigger') && !running && (
            <button
              onClick={e => { e.stopPropagation(); void handleAction('trigger'); }}
              className="px-2 py-1 text-[11px] bg-primary/20 hover:bg-primary/30 text-accent rounded transition-colors whitespace-nowrap"
            >
              {t('jobs.runAgain')}
            </button>
          )}
          {canDeleteRuns && exec.status !== 'running' && (
            <button
              onClick={e => { e.stopPropagation(); void handleDeleteRun(exec); }}
              className="px-2 py-1 text-[11px] bg-error/10 hover:bg-error/20 text-error rounded transition-colors"
            >
              {t('jobs.deleteRun')}
            </button>
          )}
        </div>
      ),
    },
  ];

  if (jobLoading) {
    return (
      <div className="p-6 text-muted">{t('jobs.loadingDetails')}</div>
    );
  }

  return (
    <div>
      <PageHeader
        title={job?.name ?? t('jobs.detailTitle')}
        subtitle={job?.description ?? t('jobs.jobId', { id: id ?? '' })}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/jobs')}
              className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors"
            >
              {t('jobs.back')}
            </button>
            {job && offers(job, 'update') && (
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors"
              >
                {t('jobs.edit')}
              </button>
            )}
            {running && offers(job, 'cancel') && (
              <button
                onClick={() => handleAction('cancel')}
                className="px-3 py-1.5 text-xs bg-error/20 hover:bg-error/30 text-error rounded-lg transition-colors"
              >
                {t('jobs.cancelRun')}
              </button>
            )}
            {offers(job, 'trigger') && (
              <button
                onClick={() => handleAction('trigger')}
                className="px-3 py-1.5 text-xs bg-primary/20 hover:bg-primary/30 text-accent rounded-lg transition-colors"
              >
                {t('jobs.trigger')}
              </button>
            )}
            {job && offers(job, 'pause') && (job.status === 'active' || job.status === 'running' || job.status === 'scheduled') && (
              <button
                onClick={() => handleAction('pause')}
                className="px-3 py-1.5 text-xs bg-warning/20 hover:bg-warning/30 text-warning rounded-lg transition-colors"
              >
                {t('jobs.pause')}
              </button>
            )}
            {job && offers(job, 'resume') && job.status === 'paused' && (
              <button
                onClick={() => handleAction('resume')}
                className="px-3 py-1.5 text-xs bg-success/20 hover:bg-success/30 text-success rounded-lg transition-colors"
              >
                {t('jobs.resume')}
              </button>
            )}
            {offers(job, 'stop') && (
              <button
                onClick={() => handleAction('stop')}
                className="px-3 py-1.5 text-xs bg-error/20 hover:bg-error/30 text-error rounded-lg transition-colors"
              >
                {t('jobs.stop')}
              </button>
            )}
          </div>
        }
      />

      <RunDetailsModal
        run={detailsRun}
        onClose={() => setDetailsRun(null)}
        statusBadge={status => <Badge variant={jobStatusVariant(status)} dot>{statusLabel(status)}</Badge>}
        triggerLabel={triggerLabel}
      />
      {editing && job && (
        <JobEditModal job={job} onClose={() => setEditing(false)} onSaved={() => { refetchJob(); }} />
      )}

      <div className="p-6 space-y-6">
        {actionError && (
          <div className="text-error text-sm p-3 bg-error/10 border border-error/20 rounded-lg">
            {actionError}
          </div>
        )}

        {/* Job Info */}
        {job && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-heading mb-3">{t('jobs.jobInfo')}</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-subtle">{t('jobs.status')}</span>
                <Badge variant={jobStatusVariant(job.status)} dot>{statusLabel(job.status)}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-subtle">{t('jobs.group')}</span>
                <span className="text-text text-xs font-mono">{job.group || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-subtle">{t('jobs.schedule')}</span>
                <span className="text-text text-xs font-mono">{job.schedule ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-subtle">{t('jobs.interval')}</span>
                <span className="text-text text-xs font-mono">{formatSpan(job.interval) ? t('jobs.every', { interval: formatSpan(job.interval)! }) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-subtle">{t('jobs.lastRun')}</span>
                <span className="text-text text-xs">{formatDate(job.lastRunAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-subtle">{t('jobs.nextRun')}</span>
                <span className="text-text text-xs">{formatDate(job.nextRunAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-subtle">{t('jobs.lastDuration')}</span>
                <span className="text-text text-xs font-mono">{formatDuration(job.lastRunDuration)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-subtle">{t('jobs.maxRetries')}</span>
                <span className="text-text text-xs font-mono">{job.maxRetries}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-subtle">{t('jobs.overlapPolicy')}</span>
                <span className="text-text text-xs font-mono">{job.overlapPolicy ? overlapLabel(job.overlapPolicy) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-subtle">{t('jobs.timeout')}</span>
                <span className="text-text text-xs font-mono">{formatSpan(job.timeout) ?? '—'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Recent runs: stats and durations */}
        {recent && recent.items.length > 0 && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label={t('jobs.successRate')} value={percent(stats.successRate)} sub={t('jobs.successRateSub')} />
              <StatCard
                label={t('jobs.failedRuns')}
                value={formatNumber(stats.failed)}
                sub={lastFailure ? t('jobs.lastFailure', { time: formatRelative(lastFailure.startedAt) }) : t('jobs.noFailures')}
                subColor={stats.failed > 0 ? 'text-error' : undefined}
              />
              <StatCard
                label={t('jobs.avgDuration')}
                value={shortDuration(stats.avgDuration)}
                sub={stats.p95Duration !== null ? t('jobs.durationSub', { p95: shortDuration(stats.p95Duration), max: shortDuration(stats.maxDuration) }) : undefined}
              />
              <StatCard
                label={t('jobs.runs')}
                value={formatNumber(stats.total)}
                sub={t('jobs.runsSub', { succeeded: formatNumber(stats.succeeded), failed: formatNumber(stats.failed) })}
              />
            </div>
            <ChartCard
              title={t('jobs.durationChart')}
              note={t('jobs.durationNote')}
              legend={<ChartLegend items={OUTCOMES.filter(o => stats[o] > 0).map(o => ({ label: t(`jobs.outcome_${o}`), color: OUTCOME_COLORS[o], value: formatNumber(stats[o]) }))} />}
            >
              <ColumnChart
                columns={durationColumns}
                xTicks={[]}
                formatValue={v => shortDuration(v)}
                selectedKey={selectedRun}
                onSelect={key => {
                  setSelectedRun(key);
                  const run = key && chartRuns.find(r => r.id === key);
                  if (!run) return;
                  handleViewLogs(run);
                  logPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }}
                stale={recentLoading}
                height={150}
                ariaLabel={t('jobs.durationChart')}
              />
            </ChartCard>
          </>
        )}

        {/* Executions */}
        <div>
          <div className="flex items-center justify-between mb-3 gap-3">
            <h3 className="text-sm font-semibold text-heading">{t('jobs.history')}</h3>
            <div className="flex items-center gap-3">
              {history && (
                <span className="text-xs text-subtle">{t('jobs.totalExecutions', { count: history.total ?? history.items?.length ?? 0 })}</span>
              )}
              <select
                aria-label={t('jobs.allResults')}
                value={historyStatus}
                onChange={e => { setHistoryStatus(e.target.value); setPage(0); }}
                className="px-3 py-1.5 text-xs bg-control border border-border/75 rounded-lg text-text focus:outline-none focus:border-primary"
              >
                <option value="">{t('jobs.allResults')}</option>
                {HISTORY_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
              {canDeleteRuns && historyStatus !== 'running' && !!history?.total && (
                <button
                  onClick={() => void handleDeleteRuns()}
                  disabled={deleting}
                  className="px-3 py-1.5 text-xs bg-error/10 hover:bg-error/20 text-error border border-error/30 rounded-lg transition-colors disabled:opacity-50"
                >
                  {historyStatus ? t('jobs.deleteRunsStatus', { status: statusLabel(historyStatus) }) : t('jobs.deleteRunsAll')}
                </button>
              )}
            </div>
          </div>
          {notice && <div role="status" className="mb-3 text-xs text-success">{notice}</div>}
          {historyLoading && <div className="text-muted text-sm">{t('jobs.loadingHistory')}</div>}
          {!historyLoading && history && (
            <>
              <DataTable
                columns={execColumns}
                data={history.items}
                keyExtractor={exec => exec.id}
                onRowClick={handleViewLogs}
              />
              {/* Pagination */}
              {history.total > pageSize && (
                <div className="flex items-center justify-between mt-3">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors disabled:opacity-40"
                  >
                    {t('jobs.previous')}
                  </button>
                  <span className="text-xs text-subtle">
                    {t('jobs.pageOf', { page: page + 1, total: Math.ceil(history.total / pageSize) })}
                  </span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={(page + 1) * pageSize >= history.total}
                    className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors disabled:opacity-40"
                  >
                    {t('jobs.next')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Log Viewer */}
        <div ref={logPanel}>
        <MonoPanel
          title={t('jobs.executionLogs')}
          lines={logsLoading ? [t('common.loading')] : logLines.length > 0 ? logLines : [t('jobs.logsHint')]}
          maxLines={500}
        />
        </div>
      </div>
    </div>
  );
}
