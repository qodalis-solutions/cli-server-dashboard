import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import DataTable from '../../components/DataTable';
import { useApi } from '../../hooks/useApi';
import { useWebSocket } from '../../context/WebSocketContext';
import { getJobs, triggerJob, pauseJob, resumeJob, stopJob } from '../../api/jobs';
import type { JobDto } from '../../types';
import { useI18n } from '../../i18n';
import { JOB_STATUSES } from '../../i18n/messages/jobs';

type KnownJobStatus = (typeof JOB_STATUSES)[number];
const isKnownStatus = (status: string): status is KnownJobStatus => (JOB_STATUSES as readonly string[]).includes(status);

function jobStatusVariant(status: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  switch (status) {
    case 'active':
    case 'running':
      return 'success';
    case 'paused':
      return 'warning';
    case 'stopped':
    case 'failed':
      return 'error';
    case 'scheduled':
      return 'info';
    default:
      return 'neutral';
  }
}

export default function JobsPage() {
  const navigate = useNavigate();
  const { t, formatDate, formatRelative } = useI18n();
  const { data, loading, error, refetch } = useApi(getJobs, []);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const { subscribe } = useWebSocket();

  useEffect(() => {
    if (data) setJobs(data);
  }, [data]);

  // Real-time status updates via WebSocket
  useEffect(() => {
    const unsub = subscribe('job:*', (event) => {
      const jobId = event.jobId as string | undefined;
      const status = event.status as string | undefined;
      if (jobId && status) {
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status } : j));
      }
    });
    return unsub;
  }, [subscribe]);

  async function handleAction(e: React.MouseEvent, jobId: string, action: 'trigger' | 'pause' | 'resume' | 'stop') {
    e.stopPropagation();
    setActionError(null);
    try {
      if (action === 'trigger') await triggerJob(jobId);
      else if (action === 'pause') await pauseJob(jobId);
      else if (action === 'resume') await resumeJob(jobId);
      else if (action === 'stop') await stopJob(jobId);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('jobs.actionFailed'));
    }
  }

  const statusLabel = (status: string) => (isKnownStatus(status) ? t(`jobs.status_${status}`) : status);

  function renderRunTime(iso: string | null) {
    if (!iso) return <span className="text-xs text-slate-400">—</span>;
    return <span className="text-xs text-slate-400" title={formatDate(iso)}>{formatRelative(iso)}</span>;
  }

  const columns = [
    {
      key: 'name',
      header: t('jobs.name'),
      render: (job: JobDto) => (
        <div>
          <div className="text-slate-200 font-medium">{job.name}</div>
          {job.description && <div className="text-xs text-slate-500 mt-0.5">{job.description}</div>}
        </div>
      ),
    },
    {
      key: 'group',
      header: t('jobs.group'),
      render: (job: JobDto) => <span className="text-slate-400 text-xs">{job.group || '—'}</span>,
    },
    {
      key: 'status',
      header: t('jobs.status'),
      render: (job: JobDto) => (
        <Badge variant={jobStatusVariant(job.status)} dot>{statusLabel(job.status)}</Badge>
      ),
    },
    {
      key: 'schedule',
      header: t('jobs.schedule'),
      render: (job: JobDto) => (
        <span className="text-xs font-mono text-slate-400">{job.schedule ?? (job.interval ? t('jobs.every', { interval: job.interval }) : '—')}</span>
      ),
    },
    {
      key: 'lastRun',
      header: t('jobs.lastRun'),
      render: (job: JobDto) => renderRunTime(job.lastRun),
    },
    {
      key: 'nextRun',
      header: t('jobs.nextRun'),
      render: (job: JobDto) => renderRunTime(job.nextRun),
    },
    {
      key: 'actions',
      header: '',
      render: (job: JobDto) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={e => handleAction(e, job.id, 'trigger')}
            className="px-2 py-1 text-[11px] bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded transition-colors"
          >
            {t('jobs.trigger')}
          </button>
          {job.status === 'active' || job.status === 'running' || job.status === 'scheduled' ? (
            <button
              onClick={e => handleAction(e, job.id, 'pause')}
              className="px-2 py-1 text-[11px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded transition-colors"
            >
              {t('jobs.pause')}
            </button>
          ) : job.status === 'paused' ? (
            <button
              onClick={e => handleAction(e, job.id, 'resume')}
              className="px-2 py-1 text-[11px] bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded transition-colors"
            >
              {t('jobs.resume')}
            </button>
          ) : null}
          <button
            onClick={e => handleAction(e, job.id, 'stop')}
            className="px-2 py-1 text-[11px] bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded transition-colors"
          >
            {t('jobs.stop')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.jobs')}
        subtitle={jobs.length ? t('jobs.subtitle', { count: jobs.length }) : t('jobs.subtitleEmpty')}
        actions={
          <button
            onClick={refetch}
            className="px-3 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors"
          >
            {t('common.refresh')}
          </button>
        }
      />
      <div className="p-6">
        {loading && <div className="text-slate-400 text-sm">{t('jobs.loadingJobs')}</div>}
        {error && <div className="text-red-400 text-sm mb-4">{t('jobs.error', { message: error })}</div>}
        {actionError && (
          <div className="text-red-400 text-sm mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            {actionError}
          </div>
        )}
        {!loading && (
          <DataTable
            columns={columns}
            data={jobs}
            keyExtractor={job => job.id}
            onRowClick={job => navigate(`/jobs/${job.id}`)}
          />
        )}
      </div>
    </div>
  );
}
