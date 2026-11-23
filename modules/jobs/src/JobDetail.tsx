import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from './router';
import { getJob, getJobHistory, getJobExecution, triggerJob, pauseJob, resumeJob, stopJob, cancelJob, deleteJobRun, deleteJobRuns, offers, formatSpan } from './api';
import JobEditModal from './JobEditModal';
import RunDetailsModal from './RunDetailsModal';
import { runLogLine, type RunSummary } from './runDetails';
import type { JobExecutionDto } from './types';
import { formatProperties } from './api';
import { useI18n } from './i18n';
import { JOB_OVERLAP_POLICIES, JOB_STATUSES, JOB_TRIGGER_TYPES } from './messages';
import { OUTCOMES, OUTCOME_COLORS, outcomeOf, runStats, runningSummary, shortDuration } from './jobInsights';
import JobTags from './JobTags';
import JobActionGroup from './JobActionGroup';
import type { JobAction } from './jobActions';
import { retentionLimits, retentionSource } from './retention';
import { ColumnChart, type Column, ChartCard, ChartLegend, useConfirm, DeleteIcon, DetailsIcon, LogsIcon, RunAgainIcon, JOB_STATE_RELOAD_DELAY, useLiveReload, useAsync, PageHeader, Badge, DataTable, MonoPanel, StatCard, Select, ButtonGroup } from '@qodalis/cli-server-dashboard-kit';

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
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, formatDate: formatDateTime, formatNumber, formatRelative } = useI18n();
  const { confirm, dialog } = useConfirm();
  const [page, setPage] = useState(0);
  const [historyStatus, setHistoryStatus] = useState('');
  const pageSize = 20;
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** The run control waiting for the server (its segment spins). */
  const [pendingAction, setPendingAction] = useState<JobAction | null>(null);

  const { data: job, loading: jobLoading, refetch: refetchJob, refresh: refreshJob } = useAsync(
    () => getJob(id!),
    [id]
  );

  const { data: history, loading: historyLoading, refetch: refetchHistory, refresh: refreshHistory } = useAsync(
    () => getJobHistory(id!, { limit: pageSize, offset: page * pageSize, status: historyStatus || undefined }),
    [id, page, historyStatus]
  );

  const { data: recent, loading: recentLoading, refetch: refetchRecent, refresh: refreshRecent } = useAsync(
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
    delay: JOB_STATE_RELOAD_DELAY,
  });
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [detailsRun, setDetailsRun] = useState<RunSummary | null>(null);
  const showDetails = (exec: JobExecutionDto) => setDetailsRun({ ...exec, jobId: exec.jobId || id! });
  // A link to a run (`?run=<execId>`, e.g. from a bar of the jobs list) opens its details
  const [params, setParams] = useSearchParams();
  const linkedRun = params.get('run');
  useEffect(() => {
    if (!id || !linkedRun) return;
    let stale = false;
    getJobExecution(id, linkedRun)
      .then(exec => { if (!stale) setDetailsRun({ ...exec, jobId: exec.jobId || id }); })
      .catch(err => { if (!stale) setActionError(t('jobs.runLoadFailedLink', { message: err instanceof Error ? err.message : String(err) })); });
    return () => { stale = true; };
    // Loaded once per linked run; `t` changes with the language only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, linkedRun]);
  const closeDetails = () => {
    setDetailsRun(null);
    if (linkedRun) setParams(prev => { const next = new URLSearchParams(prev); next.delete('run'); return next; }, { replace: true });
  };
  const canDeleteRuns = offers(job, 'delete-runs');
  const running = !!job && (job.status === 'running' || !!job.currentExecutionId);

  function handleAction(action: JobAction) {
    if (action !== 'cancel') {
      void runAction(action);
      return;
    }
    void confirm({
      title: t('jobs.cancelRun'),
      message: t('jobs.cancelRunConfirm'),
      confirmLabel: t('jobs.cancelRun'),
      cancelLabel: t('jobs.keepRunning'),
      tone: 'danger',
      onConfirm: () => runAction(action),
    });
  }

  async function runAction(action: JobAction) {
    if (!id) return;
    setActionError(null);
    setPendingAction(action);
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
    } finally {
      setPendingAction(null);
    }
  }

  /** The page shows one run fewer (or none of a status): step back when the page would be empty. */
  function afterDelete(removed: number) {
    if (history && page > 0 && history.items.length <= removed) setPage(p => Math.max(0, p - 1));
    else refetchHistory();
    refetchRecent();
    refetchJob();
  }

  function handleDeleteRun(execution: JobExecutionDto) {
    void confirm({
      title: t('jobs.deleteRunTitle'),
      message: t('jobs.deleteRunConfirm'),
      confirmLabel: t('jobs.deleteRun'),
      tone: 'danger',
      onConfirm: () => deleteRun(execution),
    });
  }

  async function deleteRun(execution: JobExecutionDto) {
    if (!id) return;
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
  function handleDeleteRuns() {
    const status = historyStatus || undefined;
    void confirm({
      title: t('jobs.deleteRunsTitle'),
      message: status ? t('jobs.deleteRunsStatusConfirm', { status: statusLabel(status) }) : t('jobs.deleteRunsAllConfirm'),
      confirmLabel: t('common.delete'),
      tone: 'danger',
      onConfirm: () => deleteRuns(status),
    });
  }

  async function deleteRuns(status: string | undefined) {
    if (!id) return;
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
      key: 'actions',
      header: '',
      render: (exec: JobExecutionDto) => (
        <div className="flex justify-end" onClick={e => e.stopPropagation()}>
          <ButtonGroup
            label={t('components.rowActions', { name: formatDateTime(exec.startedAt) })}
            labels="xl"
            items={[
              { key: 'logs', label: t('jobs.logs'), icon: <LogsIcon />, tone: 'primary', onClick: () => handleViewLogs(exec) },
              { key: 'details', label: t('jobs.runDetails'), icon: <DetailsIcon />, onClick: () => showDetails(exec) },
              ...(exec.status === 'failed' && offers(job, 'trigger') && !running ? [{
                key: 'again', label: t('jobs.runAgain'), icon: <RunAgainIcon />, tone: 'primary' as const,
                loading: pendingAction === 'trigger', disabled: pendingAction !== null, onClick: () => handleAction('trigger'),
              }] : []),
            ]}
            // Deleting is rarer and destructive: in the menu, behind a confirmation
            overflow={canDeleteRuns && exec.status !== 'running'
              ? [{ key: 'delete', label: t('jobs.deleteRun'), icon: <DeleteIcon />, tone: 'danger', onSelect: () => handleDeleteRun(exec) }]
              : []}
          />
        </div>
      ),
    },
  ];

  if (jobLoading) {
    return (
      <div className="p-4 sm:p-6 text-muted">{t('jobs.loadingDetails')}</div>
    );
  }

  return (
    <div>
      <PageHeader
        title={job?.name ?? t('jobs.detailTitle')}
        subtitle={job?.description ?? t('jobs.jobId', { id: id ?? '' })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="min-h-11 sm:min-h-8 px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors"
            >
              {t('jobs.back')}
            </button>
            {job && offers(job, 'update') && (
              <button
                onClick={() => setEditing(true)}
                className="min-h-11 sm:min-h-8 px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors"
              >
                {t('jobs.edit')}
              </button>
            )}
            {job && (
              <JobActionGroup job={job} onAction={action => handleAction(action)} pending={pendingAction} labels="sm" />
            )}
          </div>
        }
      />

      <RunDetailsModal
        run={detailsRun}
        onClose={closeDetails}
        statusBadge={status => <Badge variant={jobStatusVariant(status)} dot>{statusLabel(status)}</Badge>}
        triggerLabel={triggerLabel}
      />
      {editing && job && (
        <JobEditModal job={job} onClose={() => setEditing(false)} onSaved={() => { refetchJob(); }} />
      )}

      <div className="p-4 sm:p-6 space-y-6">
        {actionError && (
          <div className="text-error text-sm p-3 bg-error/10 border border-error/20 rounded-lg">
            {actionError}
          </div>
        )}

        {/* Job Info */}
        {job && (
          <div className="bg-surface border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-heading mb-3">{t('jobs.jobInfo')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-subtle">{t('jobs.status')}</span>
                <Badge variant={jobStatusVariant(job.status)} dot>{statusLabel(job.status)}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-subtle">{t('jobs.group')}</span>
                <span className="text-text text-xs font-mono">{job.group || '—'}</span>
              </div>
              {job.tags !== undefined && job.tags !== null && (
                <div className="flex justify-between gap-4">
                  <span className="text-subtle">{t('jobs.tags')}</span>
                  {job.tags.length > 0
                    ? <JobTags tags={job.tags} className="justify-end" />
                    : <span className="text-text text-xs font-mono">—</span>}
                </div>
              )}
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
                <span className="text-subtle">{t('jobs.maxConcurrentRuns')}</span>
                <span className="text-text text-xs font-mono">{job.maxConcurrentRuns ?? 1}</span>
              </div>
              {runningSummary(job) && (
                <div className="flex justify-between">
                  <span className="text-subtle">{t('jobs.runningNow')}</span>
                  <span className="text-text text-xs font-mono">{t(runningSummary(job)!.key, runningSummary(job)!.params)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-subtle">{t('jobs.timeout')}</span>
                <span className="text-text text-xs font-mono">{formatSpan(job.timeout) ?? '—'}</span>
              </div>
            </div>
          </div>
        )}

        {/* History retention: absent on servers before 1.0.0-beta.28 */}
        {job && job.historyRetention !== undefined && (() => {
          const retention = job.historyRetention;
          const source = retentionSource(retention);
          return (
            <div className="bg-surface border border-border rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold text-heading">{t('jobs.retention')}</h3>
                <Badge variant={source === 'overridden' || source === 'keepAll' ? 'info' : 'neutral'}>{t(`jobs.retention_${source}`)}</Badge>
              </div>
              {retention && !retention.keepAll ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  {retentionLimits(retention).map(({ limit, value }) => (
                    <div key={limit} className="flex justify-between">
                      <span className="text-subtle">{t(`jobs.retention_${limit}`)}</span>
                      <span className="text-text text-xs font-mono">{value ?? t('jobs.retentionNoLimit')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">{t(retention ? 'jobs.retentionKeepAllNote' : 'jobs.retentionForeverNote')}</p>
              )}
            </div>
          );
        })()}

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
          <div className="flex flex-wrap items-center justify-between mb-3 gap-3">
            <h3 className="text-sm font-semibold text-heading">{t('jobs.history')}</h3>
            <div className="flex items-center gap-3">
              {history && (
                <span className="text-xs text-subtle">{t('jobs.totalExecutions', { count: history.total ?? history.items?.length ?? 0 })}</span>
              )}
              <Select
                label={t('jobs.allResults')}
                options={[{ value: '', label: t('jobs.allResults') }, ...HISTORY_STATUSES.map(s => ({ value: s, label: statusLabel(s) }))]}
                value={historyStatus}
                onChange={s => { setHistoryStatus(s); setPage(0); }}
                onClear={historyStatus ? () => { setHistoryStatus(''); setPage(0); } : undefined}
              />
              {canDeleteRuns && historyStatus !== 'running' && !!history?.total && (
                <button
                  onClick={handleDeleteRuns}
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
      {dialog}
    </div>
  );
}
