import { Link } from 'react-router';
import Badge from '../../components/Badge';
import { useApi } from '../../hooks/useApi';
import { JOB_STATE_RELOAD_DELAY, useLiveReload } from '../../hooks/useLiveReload';
import { getJobHistory } from '../../api/jobs';
import type { JobDto } from '../../types';
import { useI18n } from '../../i18n';
import { outcomeOf, type Outcome } from './jobInsights';
import { deletedCount } from './retention';

const OUTCOME_VARIANT: Record<Outcome, 'success' | 'error' | 'neutral' | 'info'> = {
  succeeded: 'success',
  failed: 'error',
  cancelled: 'neutral',
  running: 'info',
};

/** The history prune job's last run: when it ran, how it ended and how many runs it deleted, linking to the job. */
export default function PruneStatus({ job, statusLabel }: { job: JobDto; statusLabel: (status: string) => string }) {
  const { t, formatDate, formatRelative, formatNumber } = useI18n();
  const { data, refresh } = useApi(() => getJobHistory(job.id, { limit: 1 }), [job.id]);
  useLiveReload('job:*', refresh, { filter: event => event.jobId === job.id, delay: JOB_STATE_RELOAD_DELAY });

  const last = data?.items[0];
  const deleted = last ? deletedCount(last.properties) : null;
  const outcome = last ? outcomeOf(last.status) : null;

  return (
    <Link
      to={`/jobs/${encodeURIComponent(job.id)}`}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-xs bg-surface border border-border rounded-xl hover:border-primary/40 transition-colors"
    >
      <span className="font-semibold text-heading">{t('jobs.prune')}</span>
      {!data && <span className="text-subtle">{t('common.loading')}</span>}
      {data && !last && <span className="text-muted">{t('jobs.pruneNeverRan')}</span>}
      {last && outcome && (
        <>
          <span className="text-muted" title={formatDate(last.startedAt)}>{t('jobs.pruneLastRun', { time: formatRelative(last.startedAt) })}</span>
          <Badge variant={OUTCOME_VARIANT[outcome]} dot>{statusLabel(last.status)}</Badge>
          {deleted !== null && (
            <span className="text-muted tabular-nums">
              {t('jobs.pruneDeleted', { count: deleted, deleted: formatNumber(deleted) })}
            </span>
          )}
        </>
      )}
      {job.nextRunAt && <span className="text-subtle sm:ml-auto">{t('jobs.pruneNextRun', { time: formatRelative(job.nextRunAt) })}</span>}
    </Link>
  );
}
