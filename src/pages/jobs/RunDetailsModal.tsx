import { useEffect, useState, type ReactNode } from 'react';
import Modal from '../../components/Modal';
import MonoPanel from '../../components/MonoPanel';
import { getJobExecution } from '../../api/jobs';
import type { JobExecutionDto } from '../../types';
import { useI18n } from '../../i18n';
import { shortDuration } from './jobInsights';
import { attemptNumber, mergeRun, runLogLine, type RunSummary } from './runDetails';

type Loaded = { run: string; execution: JobExecutionDto | null; failed: string | null };

/**
 * A run's details: status, times, attempt, the full error (lists may carry a shortened one) with a copy button, and
 * its logs. Shows what the table knows at once and fills in from the run (`GET /jobs/{id}/history/{execId}`).
 */
export default function RunDetailsModal({ run, onClose, statusBadge, triggerLabel }: {
  run: RunSummary | null;
  onClose: () => void;
  statusBadge: (status: string) => ReactNode;
  triggerLabel: (type: string) => string;
}) {
  const { t, formatDate } = useI18n();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [copied, setCopied] = useState(false);
  const key = run ? `${run.jobId}/${run.id}` : null;

  useEffect(() => {
    if (!run || !key) return;
    let stale = false;
    getJobExecution(run.jobId, run.id)
      .then(execution => { if (!stale) setLoaded({ run: key, execution, failed: null }); })
      .catch(err => { if (!stale) setLoaded({ run: key, execution: null, failed: err instanceof Error ? err.message : String(err) }); });
    return () => { stale = true; };
    // The run is identified by its key; a re-rendered table passes a new object for the same run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!run) return null;
  const current = loaded?.run === key ? loaded : null;
  const shown = mergeRun(run, current?.execution ?? null);
  const attempt = attemptNumber(shown.retryAttempt);
  const logs = current?.execution?.logs ?? [];

  async function copyError() {
    if (!shown.error) return;
    try {
      await navigator.clipboard.writeText(shown.error);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (insecure context or permission): the text can still be selected
    }
  }

  const field = (label: string, value: ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-subtle">{label}</span>
      <span className="text-xs text-text">{value}</span>
    </div>
  );

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={t('jobs.runDetailsTitle', { job: run.jobName || run.jobId })}
      actions={
        <button onClick={onClose} className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors">
          {t('common.close')}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {field(t('jobs.status'), statusBadge(shown.status))}
          {field(t('jobs.started'), formatDate(shown.startedAt))}
          {field(t('jobs.runFinished'), shown.completedAt ? formatDate(shown.completedAt) : '—')}
          {field(t('jobs.duration'), <span className="font-mono">{shortDuration(shown.duration)}</span>)}
          {field(t('jobs.runAttempt'), attempt ?? '—')}
          {field(t('jobs.trigger'), shown.triggerType ? triggerLabel(shown.triggerType) : '—')}
        </div>
        <div className="text-[11px] font-mono text-subtle break-all">{t('jobs.id')}: {run.id}</div>

        {!current && <div className="text-xs text-muted">{t('jobs.runLoading')}</div>}
        {current?.failed !== null && current?.failed !== undefined && (
          <div className="text-xs text-warning">{t('jobs.runLoadFailed', { message: current.failed })}</div>
        )}

        <section>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-heading">{t('jobs.errorColumn')}</span>
            {shown.error && (
              <button
                onClick={() => void copyError()}
                className="px-2 py-1 text-[11px] bg-control hover:bg-control-hover text-text rounded transition-colors"
              >
                {copied ? t('jobs.runErrorCopied') : t('jobs.runCopyError')}
              </button>
            )}
          </div>
          {shown.error ? (
            <pre className="text-xs text-error bg-error/10 border border-error/20 rounded-lg p-3 whitespace-pre-wrap break-words max-h-72 overflow-auto font-mono">
              {shown.error}
            </pre>
          ) : (
            <div className="text-xs text-subtle">{t('jobs.runNoError')}</div>
          )}
        </section>

        {current?.execution && (
          <MonoPanel
            title={t('jobs.logs')}
            lines={logs.length > 0 ? logs.map(runLogLine) : [t('jobs.noLogs')]}
            className="max-h-72"
          />
        )}
      </div>
    </Modal>
  );
}
