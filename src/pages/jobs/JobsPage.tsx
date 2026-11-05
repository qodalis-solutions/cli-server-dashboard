import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import DataTable from '../../components/DataTable';
import { useApi } from '../../hooks/useApi';
import { useWebSocket } from '../../context/WebSocketContext';
import { getJobs, triggerJob, pauseJob, resumeJob, stopJob, offers } from '../../api/jobs';
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

  // A (re)fetched list replaces the WebSocket-updated one
  const [jobsFor, setJobsFor] = useState(data);
  if (jobsFor !== data) {
    setJobsFor(data);
    if (data) setJobs(data);
  }

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
    if (!iso) return <span className="text-xs text-muted">—</span>;
    return <span className="text-xs text-muted" title={formatDate(iso)}>{formatRelative(iso)}</span>;
  }

  const columns = [
    {
      key: 'name',
      header: t('jobs.name'),
      render: (job: JobDto) => (
        <div>
          <div className="text-text font-medium">{job.name}</div>
          {job.description && <div className="text-xs text-subtle mt-0.5">{job.description}</div>}
        </div>
      ),
    },
    {
      key: 'group',
      header: t('jobs.group'),
      render: (job: JobDto) => <span className="text-muted text-xs">{job.group || '—'}</span>,
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
        <span className="text-xs font-mono text-muted">{job.schedule ?? (job.interval ? t('jobs.every', { interval: job.interval }) : '—')}</span>
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
          {offers(job, 'trigger') && (
            <button
              onClick={e => handleAction(e, job.id, 'trigger')}
              className="px-2 py-1 text-[11px] bg-primary/20 hover:bg-primary/30 text-accent rounded transition-colors"
            >
              {t('jobs.trigger')}
            </button>
          )}
          {offers(job, 'pause') && (job.status === 'active' || job.status === 'running' || job.status === 'scheduled') ? (
            <button
              onClick={e => handleAction(e, job.id, 'pause')}
              className="px-2 py-1 text-[11px] bg-warning/20 hover:bg-warning/30 text-warning rounded transition-colors"
            >
              {t('jobs.pause')}
            </button>
          ) : offers(job, 'resume') && job.status === 'paused' ? (
            <button
              onClick={e => handleAction(e, job.id, 'resume')}
              className="px-2 py-1 text-[11px] bg-success/20 hover:bg-success/30 text-success rounded transition-colors"
            >
              {t('jobs.resume')}
            </button>
          ) : null}
          {offers(job, 'stop') && (
            <button
              onClick={e => handleAction(e, job.id, 'stop')}
              className="px-2 py-1 text-[11px] bg-error/20 hover:bg-error/30 text-error rounded transition-colors"
            >
              {t('jobs.stop')}
            </button>
          )}
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
            className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors"
          >
            {t('common.refresh')}
          </button>
        }
      />
      <div className="p-6">
        {loading && <div className="text-muted text-sm">{t('jobs.loadingJobs')}</div>}
        {error && <div className="text-error text-sm mb-4">{t('jobs.error', { message: error })}</div>}
        {actionError && (
          <div className="text-error text-sm mb-4 p-3 bg-error/10 border border-error/20 rounded-lg">
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
