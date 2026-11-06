import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import DataTable from '../../components/DataTable';
import StatCard from '../../components/StatCard';
import ColumnChart, { type Column } from '../../components/charts/ColumnChart';
import { ChartCard, ChartLegend } from '../../components/charts/chartParts';
import { spreadTicks } from '../../components/charts/chartUtils';
import { useApi } from '../../hooks/useApi';
import { useWebSocket } from '../../context/WebSocketContext';
import { getJobs, triggerJob, pauseJob, resumeJob, stopJob, cancelJob, deleteJobRun, offers, formatSpan } from '../../api/jobs';
import type { JobDto, JobRunDto } from '../../types';
import { useI18n } from '../../i18n';
import { JOB_STATUSES } from '../../i18n/messages/jobs';
import {
  JOB_STATUS_FILTERS, OUTCOMES, OUTCOME_COLORS, RUN_RANGES, countByStatus, filterJobs, insightsFromRuns, jobGroups,
  outcomeOf, shortDuration, type JobStatusFilter, type Outcome, type RunRange,
} from './jobInsights';
import { useJobRuns } from './useJobRuns';
import { useJobStats } from './useJobStats';

type KnownJobStatus = (typeof JOB_STATUSES)[number];
const isKnownStatus = (status: string): status is KnownJobStatus => (JOB_STATUSES as readonly string[]).includes(status);

const CONTROL = 'px-3 py-1.5 text-xs bg-control border border-border/75 rounded-lg text-text focus:outline-none focus:border-primary';
/** Rows of the recent runs table, and how many more "Show more" adds. */
const RUN_ROWS = 20;
/** Runs of every job (the filters apply in the page, so changing them needs no reload). */
const ALL_JOBS = {};
/** Squares in a job's "last runs" strip. */
const STRIP_RUNS = 12;

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

const OUTCOME_VARIANT: Record<Outcome, 'success' | 'error' | 'neutral' | 'info'> = {
  succeeded: 'success',
  failed: 'error',
  cancelled: 'neutral',
  running: 'info',
};

const isRange = (value: string | null): value is RunRange => RUN_RANGES.includes(value as RunRange);
const isStatusFilter = (value: string | null): value is JobStatusFilter => JOB_STATUS_FILTERS.includes(value as JobStatusFilter);
const isOutcome = (value: string | null): value is Outcome => OUTCOMES.includes(value as Outcome);

export default function JobsPage() {
  const navigate = useNavigate();
  const { t, formatDate, formatRelative, formatNumber } = useI18n();
  const { data, loading, error, refetch } = useApi(getJobs, []);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [runRows, setRunRows] = useState(RUN_ROWS);
  const { subscribe } = useWebSocket();

  // Filters live in the URL, so a filtered view can be reloaded, shared and navigated back to
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const status = isStatusFilter(params.get('status')) ? params.get('status') as JobStatusFilter : 'all';
  const group = params.get('group') ?? '';
  const range = isRange(params.get('range')) ? params.get('range') as RunRange : '24h';
  const outcome = isOutcome(params.get('result')) ? params.get('result') as Outcome : null;
  const windowStart = Number(params.get('at')) || null;

  const setParam = (name: string, value: string | null) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(name, value);
      else next.delete(name);
      // A picked column belongs to the range it was picked in
      if (name === 'range') next.delete('at');
      return next;
    }, { replace: true });
  };
  const filtersSet = !!search || status !== 'all' || !!group;
  const clearFilters = () => setParams(prev => {
    const next = new URLSearchParams(prev);
    ['q', 'status', 'group'].forEach(name => next.delete(name));
    return next;
  }, { replace: true });

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

  const runsResult = useJobRuns(ALL_JOBS, range);
  const runsReady = runsResult.state === 'ready' ? runsResult : null;

  const filteredJobs = useMemo(() => filterJobs(jobs, { search, status, group }), [jobs, search, status, group]);
  const groups = useMemo(() => jobGroups(jobs), [jobs]);
  const statusCounts = useMemo(() => countByStatus(jobs), [jobs]);

  // Runs of the jobs shown: the filters scope the stats, the chart and the run list alike
  const runs = useMemo(() => {
    if (!runsReady) return [];
    if (!filtersSet) return runsReady.runs;
    const shown = new Set(filteredJobs.map(j => j.id));
    return runsReady.runs.filter(run => shown.has(run.jobId));
  }, [runsReady, filtersSet, filteredJobs]);

  // Exact numbers from the server when it counts them (1.0.0-beta.19), otherwise counted from the loaded runs
  const statsResult = useJobStats(range, useMemo(() => (filtersSet ? filteredJobs.map(j => j.id) : null), [filtersSet, filteredJobs]));
  const fromServer = statsResult.state === 'ready' ? statsResult.insights : null;
  const fromRuns = useMemo(
    () => (statsResult.state !== 'ready' && statsResult.state !== 'loading' && runsReady ? insightsFromRuns(runs, range, runsReady.loadedAt) : null),
    [statsResult.state, runsReady, runs, range],
  );
  const insights = fromServer ?? fromRuns;
  const stats = insights?.stats;
  const buckets = insights?.buckets ?? [];

  const selectedBucket = windowStart !== null ? buckets.find(b => b.start === windowStart) ?? null : null;
  const listedRuns = runs.filter(run => {
    if (outcome && outcomeOf(run.status) !== outcome) return false;
    if (!selectedBucket) return true;
    const time = Date.parse(run.startedAt);
    return time >= selectedBucket.start && time < selectedBucket.end;
  });

  async function handleAction(e: React.MouseEvent, jobId: string, action: 'trigger' | 'pause' | 'resume' | 'stop' | 'cancel') {
    e.stopPropagation();
    if (action === 'cancel' && !window.confirm(t('jobs.cancelRunConfirm'))) return;
    setActionError(null);
    try {
      if (action === 'cancel') await cancelJob(jobId);
      else if (action === 'trigger') await triggerJob(jobId);
      else if (action === 'pause') await pauseJob(jobId);
      else if (action === 'resume') await resumeJob(jobId);
      else if (action === 'stop') await stopJob(jobId);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('jobs.actionFailed'));
    }
  }

  const statusLabel = (status: string) => (isKnownStatus(status) ? t(`jobs.status_${status}`) : status);
  const jobOf = (jobId: string) => jobs.find(j => j.id === jobId);
  const canDelete = (run: JobRunDto) => run.status !== 'running' && offers(jobOf(run.jobId), 'delete-runs');
  const canRunAgain = (run: JobRunDto) => outcomeOf(run.status) === 'failed' && offers(jobOf(run.jobId), 'trigger');

  function reloadRuns() {
    runsResult.reload();
    statsResult.reload();
    refetch();
  }

  async function handleRunAgain(e: React.MouseEvent, run: JobRunDto) {
    e.stopPropagation();
    setActionError(null);
    setNotice(null);
    try {
      await triggerJob(run.jobId);
      setNotice(t('jobs.runAgainStarted', { job: run.jobName || run.jobId }));
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('jobs.actionFailed'));
    }
  }

  /** Deletes the given runs one by one (any job), stopping at the first refusal. */
  async function deleteRuns(toDelete: JobRunDto[]) {
    setActionError(null);
    setNotice(null);
    setDeleting(true);
    let deleted = 0;
    try {
      for (const run of toDelete) {
        await deleteJobRun(run.jobId, run.id);
        deleted++;
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('jobs.actionFailed'));
    } finally {
      setDeleting(false);
      if (deleted > 0) setNotice(t('jobs.deletedRuns', { count: deleted }));
      reloadRuns();
    }
  }

  function handleDeleteRun(e: React.MouseEvent, run: JobRunDto) {
    e.stopPropagation();
    if (window.confirm(t('jobs.deleteRunConfirm'))) void deleteRuns([run]);
  }
  const percent = (value: number | null) => (value === null ? '—' : formatNumber(value, { style: 'percent', maximumFractionDigits: 1 }));

  // Column times: hours and minutes within a day, the date as well over a week
  const tickLabel = (time: number) => formatDate(time, range === '7d'
    ? { weekday: 'short', hour: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' });
  const windowLabel = (start: number, end: number) =>
    `${formatDate(start, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} – ${formatDate(end, { hour: '2-digit', minute: '2-digit' })}`;

  const chartColumns: Column[] = buckets.map(bucket => ({
    key: String(bucket.start),
    segments: OUTCOMES.map(o => ({ key: o, value: bucket.counts[o], color: OUTCOME_COLORS[o] })),
    title: windowLabel(bucket.start, bucket.end),
    rows: OUTCOMES.filter(o => bucket.counts[o] > 0 || o === 'succeeded' || o === 'failed').map(o => ({
      label: t(`jobs.outcome_${o}`), value: formatNumber(bucket.counts[o]), color: OUTCOME_COLORS[o],
    })),
    ariaLabel: t('jobs.columnAria', { time: windowLabel(bucket.start, bucket.end), total: bucket.total, failed: bucket.counts.failed }),
  }));

  function renderRunTime(iso: string | null) {
    if (!iso) return <span className="text-xs text-muted">—</span>;
    return <span className="text-xs text-muted" title={formatDate(iso)}>{formatRelative(iso)}</span>;
  }

  /** The job's last runs as small squares, oldest first, with its success rate in the range. */
  function renderStrip(job: JobDto) {
    const summary = insights?.jobs.get(job.id);
    const recent = (summary?.recent ?? []).slice(0, STRIP_RUNS).reverse();
    if (!summary || recent.length === 0) return <span className="text-xs text-subtle">—</span>;
    const rate = summary.successRate;
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-end gap-[2px]" aria-hidden>
          {recent.map((run, i) => (
            <span
              key={`${run.startedAt}-${i}`}
              className="inline-block w-1.5 h-3.5 rounded-sm"
              style={{ background: OUTCOME_COLORS[outcomeOf(run.status)] }}
              title={`${formatDate(run.startedAt)} · ${t(`jobs.outcome_${outcomeOf(run.status)}`)} · ${shortDuration(run.duration)}`}
            />
          ))}
        </div>
        <span className="text-xs text-muted tabular-nums">{percent(rate)}</span>
      </div>
    );
  }

  const columns = [
    {
      key: 'name',
      header: t('jobs.name'),
      sortValue: (job: JobDto) => job.name,
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
      sortValue: (job: JobDto) => job.group,
      render: (job: JobDto) => <span className="text-muted text-xs">{job.group || '—'}</span>,
    },
    {
      key: 'status',
      header: t('jobs.status'),
      sortValue: (job: JobDto) => job.status,
      render: (job: JobDto) => (
        <Badge variant={jobStatusVariant(job.status)} dot>{statusLabel(job.status)}</Badge>
      ),
    },
    ...(insights ? [{
      key: 'lastRuns',
      header: t('jobs.lastRuns'),
      render: renderStrip,
      sortValue: (job: JobDto) => insights.jobs.get(job.id)?.successRate,
    }] : []),
    {
      key: 'schedule',
      header: t('jobs.schedule'),
      render: (job: JobDto) => (
        <span className="text-xs font-mono text-muted">{job.schedule ?? (formatSpan(job.interval) ? t('jobs.every', { interval: formatSpan(job.interval)! }) : '—')}</span>
      ),
    },
    {
      key: 'lastRun',
      header: t('jobs.lastRun'),
      sortValue: (job: JobDto) => (job.lastRunAt ? Date.parse(job.lastRunAt) : null),
      render: (job: JobDto) => renderRunTime(job.lastRunAt),
    },
    {
      key: 'nextRun',
      header: t('jobs.nextRun'),
      sortValue: (job: JobDto) => (job.nextRunAt ? Date.parse(job.nextRunAt) : null),
      render: (job: JobDto) => renderRunTime(job.nextRunAt),
    },
    {
      key: 'actions',
      header: '',
      render: (job: JobDto) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          {(job.status === 'running' || !!job.currentExecutionId) && offers(job, 'cancel') && (
            <button
              onClick={e => handleAction(e, job.id, 'cancel')}
              className="px-2 py-1 text-[11px] bg-error/20 hover:bg-error/30 text-error rounded transition-colors"
            >
              {t('jobs.cancelRun')}
            </button>
          )}
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

  const runColumns = [
    {
      key: 'job',
      header: t('jobs.job'),
      sortValue: (run: JobRunDto) => run.jobName || run.jobId,
      render: (run: JobRunDto) => (
        <Link to={`/jobs/${encodeURIComponent(run.jobId)}`} onClick={e => e.stopPropagation()} className="text-text hover:text-accent">
          {run.jobName || run.jobId}
        </Link>
      ),
    },
    {
      key: 'result',
      header: t('jobs.status'),
      render: (run: JobRunDto) => (
        <Badge variant={OUTCOME_VARIANT[outcomeOf(run.status)]} dot>{statusLabel(run.status)}</Badge>
      ),
    },
    {
      key: 'started',
      header: t('jobs.started'),
      sortValue: (run: JobRunDto) => Date.parse(run.startedAt),
      render: (run: JobRunDto) => renderRunTime(run.startedAt),
    },
    {
      key: 'duration',
      header: t('jobs.duration'),
      sortValue: (run: JobRunDto) => run.duration,
      render: (run: JobRunDto) => <span className="text-xs font-mono text-muted">{shortDuration(run.duration)}</span>,
    },
    {
      key: 'error',
      header: t('jobs.errorColumn'),
      render: (run: JobRunDto) => run.error
        ? <span className="text-xs text-error truncate max-w-[320px] block" title={run.error}>{run.error}</span>
        : <span className="text-subtle">—</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (run: JobRunDto) => (
        <div className="flex items-center justify-end gap-1.5">
          {canRunAgain(run) && (
            <button
              onClick={e => void handleRunAgain(e, run)}
              className="px-2 py-1 text-[11px] bg-primary/20 hover:bg-primary/30 text-accent rounded transition-colors whitespace-nowrap"
            >
              {t('jobs.runAgain')}
            </button>
          )}
          {canDelete(run) && (
            <button
              onClick={e => handleDeleteRun(e, run)}
              disabled={deleting}
              className="px-2 py-1 text-[11px] bg-error/10 hover:bg-error/20 text-error rounded transition-colors disabled:opacity-50"
            >
              {t('jobs.deleteRun')}
            </button>
          )}
        </div>
      ),
    },
  ];
  const deletableListed = listedRuns.filter(canDelete);

  // Counted from loaded runs, and not all of them could be loaded
  const truncated = !fromServer && runsReady && runsReady.total > runsReady.runs.length;
  const listTruncated = runsReady && runsReady.total > runsReady.runs.length;

  return (
    <div>
      <PageHeader
        title={t('nav.jobs')}
        subtitle={jobs.length ? t('jobs.subtitle', { count: jobs.length }) : t('jobs.subtitleEmpty')}
        actions={
          <button
            onClick={() => { refetch(); runsResult.reload(); statsResult.reload(); }}
            className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors"
          >
            {t('common.refresh')}
          </button>
        }
      />
      <div className="p-6 space-y-5">
        {/* Filters: one row, scoping everything below */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="search"
            placeholder={t('jobs.searchJobs')}
            aria-label={t('jobs.searchJobs')}
            value={search}
            onChange={e => setParam('q', e.target.value)}
            className={`w-56 placeholder-subtle ${CONTROL}`}
          />
          <div className="flex items-center gap-1 flex-wrap" role="group" aria-label={t('jobs.status')}>
            {JOB_STATUS_FILTERS.filter(s => s === 'all' || statusCounts[s] > 0 || s === status).map(s => (
              <button
                key={s}
                onClick={() => setParam('status', s === 'all' ? null : s)}
                aria-pressed={status === s}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                  status === s
                    ? 'bg-primary/20 text-accent border-primary/40'
                    : 'bg-surface/75 text-muted border-border/75 hover:text-text'
                }`}
              >
                {t(`jobs.statusFilter_${s}`)} <span className="tabular-nums text-subtle">{statusCounts[s]}</span>
              </button>
            ))}
          </div>
          {groups.length > 0 && (
            <select aria-label={t('jobs.group')} value={group} onChange={e => setParam('group', e.target.value || null)} className={CONTROL}>
              <option value="">{t('jobs.allGroups')}</option>
              {groups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          <select aria-label={t('jobs.range')} value={range} onChange={e => setParam('range', e.target.value === '24h' ? null : e.target.value)} className={CONTROL}>
            {RUN_RANGES.map(r => <option key={r} value={r}>{t(`jobs.range_${r}`)}</option>)}
          </select>
          {filtersSet && (
            <button onClick={clearFilters} className="text-xs text-accent hover:underline">{t('jobs.clearFilters')}</button>
          )}
        </div>

        {loading && <div className="text-muted text-sm">{t('jobs.loadingJobs')}</div>}
        {error && <div className="text-error text-sm">{t('jobs.error', { message: error })}</div>}
        {actionError && (
          <div className="text-error text-sm p-3 bg-error/10 border border-error/20 rounded-lg">
            {actionError}
          </div>
        )}

        {/* Run statistics and chart: only on servers that list runs across jobs */}
        {runsResult.state === 'unavailable' && !fromServer && <div className="text-xs text-subtle">{t('jobs.runsUnavailable')}</div>}
        {runsResult.state === 'error' && <div className="text-error text-sm">{t('jobs.runsError', { message: runsResult.message })}</div>}
        {statsResult.state === 'error' && <div className="text-error text-sm">{t('jobs.runsError', { message: statsResult.message })}</div>}
        {insights && stats && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label={t('jobs.runs')}
                value={formatNumber(stats.total)}
                sub={t('jobs.runsSub', { succeeded: formatNumber(stats.succeeded), failed: formatNumber(stats.failed) })}
              />
              <StatCard label={t('jobs.successRate')} value={percent(stats.successRate)} sub={t('jobs.successRateSub')} />
              <StatCard
                label={t('jobs.failedRuns')}
                value={formatNumber(stats.failed)}
                sub={insights.lastFailureAt ? t('jobs.lastFailure', { time: formatRelative(insights.lastFailureAt) }) : t('jobs.noFailures')}
                subColor={stats.failed > 0 ? 'text-error' : undefined}
              />
              <StatCard
                label={t('jobs.avgDuration')}
                value={shortDuration(stats.avgDuration)}
                sub={stats.p95Duration !== null ? t('jobs.durationSub', { p95: shortDuration(stats.p95Duration), max: shortDuration(stats.maxDuration) }) : undefined}
              />
            </div>

            <ChartCard
              title={t('jobs.runsChart')}
              note={<>
                {t(`jobs.chartNote_${range}`)}
                {truncated && runsReady && <> · {t('jobs.truncated', { shown: formatNumber(runsReady.runs.length), total: formatNumber(runsReady.total) })}</>}
              </>}
              legend={<ChartLegend items={OUTCOMES.map(o => ({ label: t(`jobs.outcome_${o}`), color: OUTCOME_COLORS[o], value: formatNumber(stats[o]) }))} />}
            >
              <ColumnChart
                columns={chartColumns}
                xTicks={spreadTicks(buckets.length, 6).map(i => ({ index: i, label: tickLabel(buckets[i].start) }))}
                formatValue={v => formatNumber(v, { notation: 'compact' })}
                integer
                selectedKey={selectedBucket ? String(selectedBucket.start) : null}
                onSelect={key => setParam('at', key)}
                stale={fromServer ? statsResult.reloading : runsResult.reloading}
                ariaLabel={t('jobs.runsChart')}
              />
            </ChartCard>
          </>
        )}

        {!loading && (
          filteredJobs.length === 0 && jobs.length > 0 ? (
            <div className="bg-surface border border-border rounded-xl px-4 py-8 text-center text-sm text-subtle">
              {t('jobs.noMatches')}{' '}
              <button onClick={clearFilters} className="text-accent hover:underline">{t('jobs.clearFilters')}</button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredJobs}
              keyExtractor={job => job.id}
              onRowClick={job => navigate(`/jobs/${job.id}`)}
            />
          )
        )}

        {runsReady && (
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold text-heading">{t('jobs.recentRuns')}</h3>
                {selectedBucket && (
                  <span className="inline-flex items-center gap-2 text-xs text-muted bg-control rounded-lg px-2 py-1">
                    {windowLabel(selectedBucket.start, selectedBucket.end)}
                    <button onClick={() => setParam('at', null)} className="text-accent hover:underline">{t('jobs.clearWindow')}</button>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {listTruncated && (
                  <span className="text-xs text-subtle">{t('jobs.listLatest', { shown: formatNumber(runsReady.runs.length) })}</span>
                )}
                {listedRuns.length > runRows && (
                  <span className="text-xs text-subtle">{t('jobs.showingRuns', { shown: formatNumber(runRows), total: formatNumber(listedRuns.length) })}</span>
                )}
                <select aria-label={t('jobs.allResults')} value={outcome ?? ''} onChange={e => setParam('result', e.target.value || null)} className={CONTROL}>
                  <option value="">{t('jobs.allResults')}</option>
                  {OUTCOMES.map(o => <option key={o} value={o}>{t(`jobs.outcome_${o}`)}</option>)}
                </select>
                {/* Only with a result or a column picked, so a click never clears every run of every job */}
                {(outcome || selectedBucket) && deletableListed.length > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm(t('jobs.deleteListedConfirm', { count: deletableListed.length }))) void deleteRuns(deletableListed);
                    }}
                    disabled={deleting}
                    className="px-3 py-1.5 text-xs bg-error/10 hover:bg-error/20 text-error border border-error/30 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {t('jobs.deleteListed', { count: deletableListed.length })}
                  </button>
                )}
              </div>
            </div>
            {notice && <div role="status" className="mb-3 text-xs text-success">{notice}</div>}
            {listedRuns.length === 0 ? (
              <div className="bg-surface border border-border rounded-xl px-4 py-8 text-center text-sm text-subtle">{t('jobs.noRuns')}</div>
            ) : (
              <>
                <DataTable
                  columns={runColumns}
                  data={listedRuns.slice(0, runRows)}
                  keyExtractor={run => run.id}
                  onRowClick={run => navigate(`/jobs/${encodeURIComponent(run.jobId)}`)}
                />
                {listedRuns.length > runRows && (
                  <button
                    onClick={() => setRunRows(rows => rows + RUN_ROWS)}
                    className="mt-3 w-full px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors"
                  >
                    {t('jobs.showMore')}
                  </button>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
