import { useEffect, useState } from 'react';
import { Link } from './Link';
import { useNavigate } from './router';
import type { JobExecutionDto, RecentRunDto } from './types';
import { useI18n } from './i18n';
import { OUTCOME_COLORS, outcomeOf, shortDuration } from './jobInsights';
import { cachedRun, loadRun, previewOf, runPath } from './runPreview';
import { Tooltip } from '@qodalis/cli-server-dashboard-kit';

const BAR = 'inline-flex items-end rounded-sm px-px py-1 [@media(pointer:coarse)]:px-1 [@media(pointer:coarse)]:py-2 hover:bg-control-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';

/**
 * A job's last runs as small bars, oldest first. Each bar is a link to the run (a button when the statistics did not
 * send its id: it is looked up first) with a tooltip that shows the run at once and loads its details on demand.
 */
export default function RunStrip({ jobId, runs }: { jobId: string; runs: RecentRunDto[] }) {
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();

  async function openLookedUp(run: RecentRunDto) {
    try {
      const found = await loadRun(jobId, run);
      navigate(found ? runPath(jobId, found.id) : `/${encodeURIComponent(jobId)}`);
    } catch {
      navigate(`/${encodeURIComponent(jobId)}`);
    }
  }

  return (
    <div className="flex items-end" role="list">
      {runs.map((run, i) => {
        const outcome = outcomeOf(run.status);
        const label = t('jobs.runBarLabel', { time: formatDate(run.startedAt), status: t(`jobs.outcome_${outcome}`), duration: shortDuration(run.duration) });
        const bar = <span aria-hidden className="block w-1.5 h-3.5 rounded-sm" style={{ background: OUTCOME_COLORS[outcome] }} />;
        return (
          <span role="listitem" key={run.id ?? `${run.startedAt}-${i}`} className="inline-flex">
            <Tooltip content={() => <RunTooltip jobId={jobId} run={run} />}>
              {describedBy => run.id ? (
                <Link
                  to={runPath(jobId, run.id)}
                  onClick={e => e.stopPropagation()}
                  aria-label={label}
                  aria-describedby={describedBy}
                  data-run-bar
                  data-outcome={outcome}
                  className={BAR}
                >
                  {bar}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); void openLookedUp(run); }}
                  aria-label={label}
                  aria-describedby={describedBy}
                  data-run-bar
                  data-outcome={outcome}
                  className={BAR}
                >
                  {bar}
                </button>
              )}
            </Tooltip>
          </span>
        );
      })}
    </div>
  );
}

type Details = { state: 'loading' } | { state: 'ready'; run: JobExecutionDto | null } | { state: 'error'; message: string };

/** What a bar's tooltip shows: the run as the strip knows it, then its error, attempt, last log lines and values. */
function RunTooltip({ jobId, run }: { jobId: string; run: RecentRunDto }) {
  const { t, formatDate } = useI18n();
  const outcome = outcomeOf(run.status);
  const cached = cachedRun(jobId, run);
  const [details, setDetails] = useState<Details>(cached !== undefined ? { state: 'ready', run: cached } : { state: 'loading' });

  // Loaded once per run (cached); leaving the bar closes the tooltip and aborts the request
  useEffect(() => {
    if (cached !== undefined) return;
    const controller = new AbortController();
    loadRun(jobId, run, controller.signal)
      .then(found => setDetails({ state: 'ready', run: found }))
      .catch(err => {
        if (!controller.signal.aborted) setDetails({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
    // The run is identified by job and start (or id); the strip passes a new object on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, run.id, run.startedAt]);

  const preview = details.state === 'ready' && details.run ? previewOf(details.run) : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: OUTCOME_COLORS[outcome] }} />
        <span className="font-medium text-heading">{t(`jobs.outcome_${outcome}`)}</span>
        <span className="text-muted tabular-nums">{shortDuration(run.duration)}</span>
      </div>
      <div className="text-muted">{formatDate(run.startedAt)}</div>
      {details.state === 'loading' && <div className="text-subtle">{t('jobs.runPreviewLoading')}</div>}
      {details.state === 'error' && <div className="text-error">{t('jobs.runPreviewFailed', { message: details.message })}</div>}
      {details.state === 'ready' && !details.run && <div className="text-subtle">{t('jobs.runPreviewGone')}</div>}
      {preview && (
        <>
          {preview.attempt !== null && preview.attempt > 1 && (
            <div className="text-muted">{t('jobs.runAttempt')} {preview.attempt}</div>
          )}
          {preview.error && <div className="text-error break-words">{preview.error}</div>}
          {preview.properties.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {preview.properties.map(p => <span key={p} className="font-mono text-[11px] bg-control px-1.5 py-0.5 rounded">{p}</span>)}
            </div>
          )}
          {preview.logs.length > 0 && (
            <div>
              <div className="text-subtle">{t('jobs.runPreviewLogs')}</div>
              <div className="font-mono text-[11px] text-muted">
                {preview.logs.map((line, i) => <div key={i} className="truncate">{line}</div>)}
              </div>
            </div>
          )}
        </>
      )}
      <div className="text-subtle pt-0.5">{t('jobs.runPreviewOpen')}</div>
    </div>
  );
}
