import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import DataTable from '../../components/DataTable';
import MonoPanel from '../../components/MonoPanel';
import { useApi } from '../../hooks/useApi';
import { getJob, getJobHistory, getJobExecution, triggerJob, pauseJob, resumeJob, stopJob } from '../../api/jobs';
import type { JobExecutionDto } from '../../types';

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

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  }

  async function handleViewLogs(execution: JobExecutionDto) {
    if (!id) return;
    setLogsLoading(true);
    setLogLines([`Loading logs for execution ${execution.id}...`]);
    try {
      const exec = await getJobExecution(id, execution.id);
      if (exec.logs && exec.logs.length > 0) {
        setLogLines(exec.logs.map(l => `[${l.timestamp}] [${l.level}] ${l.message}`));
      } else {
        setLogLines(['No logs available for this execution.']);
      }
    } catch (err) {
      setLogLines([`Error loading logs: ${err instanceof Error ? err.message : 'Unknown error'}`]);
    } finally {
      setLogsLoading(false);
    }
  }

  const execColumns = [
    {
      key: 'id',
      header: 'ID',
      render: (exec: JobExecutionDto) => (
        <span className="font-mono text-xs text-slate-400">{exec.id.slice(0, 8)}...</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (exec: JobExecutionDto) => (
        <Badge variant={jobStatusVariant(exec.status)} dot>{exec.status}</Badge>
      ),
    },
    {
      key: 'startedAt',
      header: 'Started',
      render: (exec: JobExecutionDto) => (
        <span className="text-xs text-slate-400">{formatDate(exec.startedAt)}</span>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      render: (exec: JobExecutionDto) => (
        <span className="text-xs font-mono text-slate-400">{formatDuration(exec.duration)}</span>
      ),
    },
    {
      key: 'triggerType',
      header: 'Trigger',
      render: (exec: JobExecutionDto) => (
        <span className="text-xs text-slate-500">{exec.triggerType || '—'}</span>
      ),
    },
    {
      key: 'error',
      header: 'Error',
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
          Logs
        </button>
      ),
    },
  ];

  if (jobLoading) {
    return (
      <div className="p-6 text-slate-400">Loading job details...</div>
    );
  }

  return (
    <div>
      <PageHeader
        title={job?.name ?? 'Job Detail'}
        subtitle={job?.description ?? `Job ${id}`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/jobs')}
              className="px-3 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={() => handleAction('trigger')}
              className="px-3 py-1.5 text-xs bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 rounded-lg transition-colors"
            >
              Trigger
            </button>
            {job && (job.status === 'active' || job.status === 'running' || job.status === 'scheduled') && (
              <button
                onClick={() => handleAction('pause')}
                className="px-3 py-1.5 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg transition-colors"
              >
                Pause
              </button>
            )}
            {job && job.status === 'paused' && (
              <button
                onClick={() => handleAction('resume')}
                className="px-3 py-1.5 text-xs bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg transition-colors"
              >
                Resume
              </button>
            )}
            <button
              onClick={() => handleAction('stop')}
              className="px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors"
            >
              Stop
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
            <h3 className="text-sm font-semibold text-white mb-3">Job Information</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <Badge variant={jobStatusVariant(job.status)} dot>{job.status}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Group</span>
                <span className="text-slate-300 text-xs font-mono">{job.group || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Schedule</span>
                <span className="text-slate-300 text-xs font-mono">{job.schedule ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Interval</span>
                <span className="text-slate-300 text-xs font-mono">{job.interval ?? '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Last Run</span>
                <span className="text-slate-300 text-xs">{formatDate(job.lastRun)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Next Run</span>
                <span className="text-slate-300 text-xs">{formatDate(job.nextRun)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Last Duration</span>
                <span className="text-slate-300 text-xs font-mono">{formatDuration(job.lastDuration)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Max Retries</span>
                <span className="text-slate-300 text-xs font-mono">{job.maxRetries}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Overlap Policy</span>
                <span className="text-slate-300 text-xs font-mono">{job.overlapPolicy || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Timeout</span>
                <span className="text-slate-300 text-xs font-mono">{job.timeout ?? '—'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Executions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Execution History</h3>
            {history && (
              <span className="text-xs text-slate-500">{history.total} total executions</span>
            )}
          </div>
          {historyLoading && <div className="text-slate-400 text-sm">Loading history...</div>}
          {!historyLoading && history && (
            <>
              <DataTable
                columns={execColumns}
                data={history.executions}
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
                    Previous
                  </button>
                  <span className="text-xs text-slate-500">
                    Page {page + 1} of {Math.ceil(history.total / pageSize)}
                  </span>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={(page + 1) * pageSize >= history.total}
                    className="px-3 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 rounded-lg transition-colors disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Log Viewer */}
        <MonoPanel
          title="Execution Logs"
          lines={logsLoading ? ['Loading...'] : logLines.length > 0 ? logLines : ['Click an execution row or its Logs button to view logs.']}
          maxLines={500}
        />
      </div>
    </div>
  );
}
