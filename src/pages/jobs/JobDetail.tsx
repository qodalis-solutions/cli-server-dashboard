import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import DataTable from '../../components/DataTable';
import MonoPanel from '../../components/MonoPanel';
import { useApi } from '../../hooks/useApi';
import { getJob, getJobHistory, getJobExecution, triggerJob, pauseJob, resumeJob, stopJob } from '../../api/jobs';
import type { JobExecutionDto } from '../../types';
import { useI18n } from '../../i18n';
import { JOB_OVERLAP_POLICIES, JOB_STATUSES, JOB_TRIGGER_TYPES } from '../../i18n/messages/jobs';

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
  const { t, formatDate: formatDateTime, formatNumber } = useI18n();
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: job, loading: jobLoading, refetch: refetchJob } = useApi(
    () => getJob(id!),
    [id]
  );

  const { data: history, loading: historyLoading, refetch: refetchHistory } = useApi(
    () => getJobHistory(id!, { limit: pageSize, offset: page * pageSize }),
    [id, page]
  );

  const formatDate = (iso: string | null) => (iso ? formatDateTime(iso) : '—');
  const formatDuration = (ms: number | null | undefined) => {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
    if (ms < 1000) return formatNumber(ms, { style: 'unit', unit: 'millisecond', unitDisplay: 'narrow' });
    return formatNumber(ms / 1000, { style: 'unit', unit: 'second', unitDisplay: 'narrow', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const statusLabel = (status: string) => (isOneOf(JOB_STATUSES, status) ? t(`jobs.status_${status}`) : status);
  const triggerLabel = (type: string) => (isOneOf(JOB_TRIGGER_TYPES, type) ? t(`jobs.trigger_${type}`) : type);
  const overlapLabel = (policy: string) => (isOneOf(JOB_OVERLAP_POLICIES, policy) ? t(`jobs.overlap_${policy}`) : policy);

  async function handleAction(action: 'trigger' | 'pause' | 'resume' | 'stop') {
    if (!id) return;
    setActionError(null);
    try {
      if (action === 'trigger') await triggerJob(id);
      else if (action === 'pause') await pauseJob(id);
      else if (action === 'resume') await resumeJob(id);
      else if (action === 'stop') await stopJob(id);
      refetchJob();
      refetchHistory();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('jobs.actionFailed'));
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
        setLogLines(exec.logs.map(l => `[${l.timestamp}] [${l.level}] ${l.message}`));
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

  const execColumns = [
    {
      key: 'id',
      header: t('jobs.id'),
      render: (exec: JobExecutionDto) => (
        <span className="font-mono text-xs text-slate-400">{exec.id.slice(0, 8)}...</span>
      ),
    },
    {
      key: 'status',
      header: t('jobs.status'),
      render: (exec: JobExecutionDto) => (
        <Badge variant={jobStatusVariant(exec.status)} dot>{statusLabel(exec.status)}</Badge>
      ),
    },
    {
      key: 'startedAt',
      header: t('jobs.started'),
      render: (exec: JobExecutionDto) => (
        <span className="text-xs text-slate-400">{formatDate(exec.startedAt)}</span>
      ),
    },
    {
      key: 'duration',
      header: t('jobs.duration'),
      render: (exec: JobExecutionDto) => (
        <span className="text-xs font-mono text-slate-400">{formatDuration(exec.duration)}</span>
      ),
    },
    {
      key: 'triggerType',
      header: t('jobs.trigger'),
      render: (exec: JobExecutionDto) => (
        <span className="text-xs text-slate-500">{exec.triggerType ? triggerLabel(exec.triggerType) : '—'}</span>
      ),
    },
    {
      key: 'error',
      header: t('jobs.errorColumn'),
      render: (exec: JobExecutionDto) => exec.error ? (
        <span className="text-xs text-red-400 truncate max-w-[200px] block" title={exec.error}>{exec.error}</span>
      ) : <span className="text-slate-600">—</span>,
    },
    {
      key: 'logs',
      header: '',
      render: (exec: JobExecutionDto) => (
        <button
          onClick={e => { e.stopPropagation(); handleViewLogs(exec); }}
          className="px-2 py-1 text-[11px] bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded transition-colors"
        >
          {t('jobs.logs')}
        </button>
      ),
    },
  ];

  if (jobLoading) {
    return (
      <div className="p-6 text-slate-400">{t('jobs.loadingDetails')}</div>
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
              className="px-3 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors"
            >
              {t('jobs.back')}
            </button>
            <button
              onClick={() => handleAction('trigger')}
              className="px-3 py-1.5 text-xs bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-lg transition-colors"
            >
              {t('jobs.trigger')}
            </button>
            {job && (job.status === 'active' || job.status === 'running' || job.status === 'scheduled') && (
              <button
                onClick={() => handleAction('pause')}
                className="px-3 py-1.5 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg transition-colors"
              >
                {t('jobs.pause')}
              </button>
            )}
            {job && job.status === 'paused' && (
              <button
                onClick={() => handleAction('resume')}
                className="px-3 py-1.5 text-xs bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg transition-colors"
              >
                {t('jobs.resume')}
              </button>
            )}
            <button
              onClick={() => handleAction('stop')}
              className="px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors"
            >
              {t('jobs.stop')}
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {actionError && (
          <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            {actionError}
          </div>
        )}

        {/* Job Info */}
        {job && (
          <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">{t('jobs.jobInfo')}</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('jobs.status')}</span>
                <Badge variant={jobStatusVariant(job.status)} dot>{statusLabel(job.status)}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('jobs.group')}</span>
                <span className="text-slate-300 text-xs font-mono">{job.group || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('jobs.schedule')}</span>
                <span className="text-slate-300 text-xs font-mono">{job.schedule ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('jobs.interval')}</span>
                <span className="text-slate-300 text-xs font-mono">{job.interval ? t('jobs.every', { interval: job.interval }) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('jobs.lastRun')}</span>
                <span className="text-slate-300 text-xs">{formatDate(job.lastRun)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('jobs.nextRun')}</span>
                <span className="text-slate-300 text-xs">{formatDate(job.nextRun)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('jobs.lastDuration')}</span>
                <span className="text-slate-300 text-xs font-mono">{formatDuration(job.lastDuration)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('jobs.maxRetries')}</span>
                <span className="text-slate-300 text-xs font-mono">{job.maxRetries}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('jobs.overlapPolicy')}</span>
                <span className="text-slate-300 text-xs font-mono">{job.overlapPolicy ? overlapLabel(job.overlapPolicy) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t('jobs.timeout')}</span>
                <span className="text-slate-300 text-xs font-mono">{job.timeout ?? '—'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Executions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">{t('jobs.history')}</h3>
            {history && (
              <span className="text-xs text-slate-500">{t('jobs.totalExecutions', { count: history.total })}</span>
            )}
          </div>
          {historyLoading && <div className="text-slate-400 text-sm">{t('jobs.loadingHistory')}</div>}
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
                    className="px-3 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {t('jobs.previous')}
                  </button>
                  <span className="text-xs text-slate-500">
                    {t('jobs.pageOf', { page: page + 1, total: Math.ceil(history.total / pageSize) })}
                  </span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={(page + 1) * pageSize >= history.total}
                    className="px-3 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {t('jobs.next')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Log Viewer */}
        <MonoPanel
          title={t('jobs.executionLogs')}
          lines={logsLoading ? [t('common.loading')] : logLines.length > 0 ? logLines : [t('jobs.logsHint')]}
          maxLines={500}
        />
      </div>
    </div>
  );
}
