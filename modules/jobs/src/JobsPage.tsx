import { useEffect, useMemo, useState } from 'react';
import { Link } from './Link';
import { useNavigate, useSearchParams } from './router';
import { getJobs, triggerJob, pauseJob, resumeJob, stopJob, cancelJob, deleteJobRun, offers, formatSpan } from './api';
import type { JobDto, JobRunDto } from './types';
import { useI18n } from './i18n';
import { JOB_STATUSES, JOB_TRIGGER_TYPES } from './messages';
import {
  JOB_STATUS_FILTERS, OUTCOMES, OUTCOME_COLORS, RUN_RANGES, countByStatus, filterJobs, insightsFromRuns, jobGroups, jobTags,
  outcomeOf, runningSummary, shortDuration, type JobStatusFilter, type Outcome, type RunRange,
} from './jobInsights';
import { useJobRuns } from './useJobRuns';
import { useJobStats } from './useJobStats';
import RunDetailsModal from './RunDetailsModal';
import JobTags from './JobTags';
import PruneStatus from './PruneStatus';
import RunStrip from './RunStrip';
import JobActionGroup from './JobActionGroup';
import type { JobAction } from './jobActions';
import { tagStyle } from '@qodalis/cli-server-dashboard-kit';
import { findPruneJob } from './retention';
import { JOBS_TABS, activeFilterCount, parseJobsTab, runsPageQuery, wideScreen } from './jobsView';
import { useRunsPage } from './useRunsPage';
import { EmptyState, ErrorState, errorText, Skeleton, SkeletonGroup, SkeletonChartCard, SkeletonStatCards, SkeletonTable, usePaging, MultiSelect, Select, DeleteIcon, DetailsIcon, RunAgainIcon, useConfirm, clampPage, JOB_STATE_RELOAD_DELAY, useLiveReload, useAsync, useDashboard, PageHeader, Badge, DataTable, StatCard, ButtonGroup, Pagination } from '@qodalis/cli-server-dashboard-kit';
import { useStoredState } from '@qodalis/cli-server-dashboard-kit';
import type { RunSummary } from './runDetails';
import { ColumnChart, type Column, ChartCard, ChartLegend, spreadTicks } from '@qodalis/cli-server-dashboard-kit';

type KnownJobStatus = (typeof JOB_STATUSES)[number];
const isKnownStatus = (status: string): status is KnownJobStatus => (JOB_STATUSES as readonly string[]).includes(status);

const CONTROL = 'px-3 py-1.5 text-xs bg-control border border-border/75 rounded-lg text-text focus:outline-none focus:border-primary';
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
  const { confirm, dialog } = useConfirm();
  const { data, loading, error, refetch, refresh } = useAsync(getJobs, []);
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [detailsRun, setDetailsRun] = useState<RunSummary | null>(null);
  /** The job action waiting for the server: its segment spins and the job's other actions wait. */
  const [pendingAction, setPendingAction] = useState<{ jobId: string; action: JobAction } | null>(null);
  const { onServerEvent: subscribe } = useDashboard();

  // Filters live in the URL, so a filtered view can be reloaded, shared and navigated back to
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const status = isStatusFilter(params.get('status')) ? params.get('status') as JobStatusFilter : 'all';
  const group = params.get('group') ?? '';
  // A stable list while the URL's tags stay the same
  const tagKey = params.getAll('tag').filter(Boolean).join('\n');
  const selectedTags = useMemo(() => (tagKey ? tagKey.split('\n') : []), [tagKey]);
  const range = isRange(params.get('range')) ? params.get('range') as RunRange : '24h';
  const outcome = isOutcome(params.get('result')) ? params.get('result') as Outcome : null;
  const windowStart = Number(params.get('at')) || null;
  const tab = parseJobsTab(params.get('tab'));

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
  /** The tags of the filter; a job must have every selected tag. */
  const setTags = (picked: string[]) => setParams(prev => {
    const next = new URLSearchParams(prev);
    next.delete('tag');
    picked.forEach(tag => next.append('tag', tag));
    return next;
  }, { replace: true });
  // Open or folded, remembered per viewer; folded by default on small screens
  const [filtersOpen, setFiltersOpen] = useStoredState('qcli_admin_jobs_filters_open', v => (v === 'true' ? true : v === 'false' ? false : null), wideScreen);
  const filtersSet = !!search || status !== 'all' || !!group || selectedTags.length > 0;
  const clearFilters = () => setParams(prev => {
    const next = new URLSearchParams(prev);
    ['q', 'status', 'group', 'tag'].forEach(name => next.delete(name));
    return next;
  }, { replace: true });

  // A (re)fetched list replaces the WebSocket-updated one
  const [jobsFor, setJobsFor] = useState(data);
  if (jobsFor !== data) {
    setJobsFor(data);
    if (data) setJobs(data);
  }

  // Paused, resumed and stopped carry the job's new status: show it at once, before the reload below
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
  // Any job event can change the list (next run, current run, options); the runs and stats reload themselves
  useLiveReload('job:*', refresh, { delay: JOB_STATE_RELOAD_DELAY });

  const runsResult = useJobRuns(ALL_JOBS, range);
  const runsReady = runsResult.state === 'ready' ? runsResult : null;

  const filteredJobs = useMemo(
    () => filterJobs(jobs, { search, status, group, tags: selectedTags }),
    [jobs, search, status, group, selectedTags],
  );
  const groups = useMemo(() => jobGroups(jobs), [jobs]);
  // Tags of the jobs plus the selected ones (a tag no job has any more stays removable)
  const tags = useMemo(() => {
    const all = jobTags(jobs);
    const missing = selectedTags.filter(s => !all.some(t => t.toLowerCase() === s.toLowerCase()));
    return [...all, ...missing];
  }, [jobs, selectedTags]);
  const isTagSelected = (tag: string) => selectedTags.some(s => s.toLowerCase() === tag.toLowerCase());
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
  // The run numbers are on their way (not on servers without runs, nor after a failure)
  const statsPending = !insights && (runsResult.state === 'loading'
    || (statsResult.state === 'loading' && runsResult.state !== 'unavailable' && runsResult.state !== 'error'));
  const stats = insights?.stats;
  const buckets = insights?.buckets ?? [];

  const selectedBucket = windowStart !== null ? buckets.find(b => b.start === windowStart) ?? null : null;
  const listedRuns = runs.filter(run => {
    if (outcome && outcomeOf(run.status) !== outcome) return false;
    if (!selectedBucket) return true;
    const time = Date.parse(run.startedAt);
    return time >= selectedBucket.start && time < selectedBucket.end;
  });

  // Both lists are paged; a new filter or range goes back to the first page
  const jobsPaging = usePaging('qcli_admin_jobs_page_size', [search, status, group, tagKey].join('\n'));
  const runsPaging = usePaging('qcli_admin_job_runs_page_size', [search, status, group, tagKey, range, outcome ?? '', windowStart ?? ''].join('\n'));
  // The server pages the run list when it can answer the view's query; otherwise the loaded runs are paged here
  const runsQuery = runsReady
    ? runsPageQuery({ filters: { search, status, group, tags: selectedTags }, jobIds: filteredJobs.map(j => j.id), outcome, windowPicked: windowStart !== null })
    : null;
  const runsPage = useRunsPage(runsQuery, range, runsPaging.page, runsPaging.pageSize);
  const serverRuns = runsPage.state === 'ready' ? runsPage : null;
  const runsTotal = runsQuery ? serverRuns?.total ?? null : listedRuns.length;
  // Runs deleted under the last page: step back onto the new last one
  const lastRunsPage = serverRuns ? clampPage(runsPaging.page, serverRuns.total, runsPaging.pageSize) : runsPaging.page;
  if (lastRunsPage !== runsPaging.page) runsPaging.setPage(lastRunsPage);
  const jobsPage = clampPage(jobsPaging.page, filteredJobs.length, jobsPaging.pageSize);

  function handleAction(e: React.MouseEvent, jobId: string, action: JobAction) {
    e.stopPropagation();
    if (action !== 'cancel') {
      void runAction(jobId, action);
      return;
    }
    void confirm({
      title: t('jobs.cancelRun'),
      message: t('jobs.cancelRunConfirm'),
      confirmLabel: t('jobs.cancelRun'),
      cancelLabel: t('jobs.keepRunning'),
      tone: 'danger',
      onConfirm: () => runAction(jobId, action),
    });
  }

  async function runAction(jobId: string, action: JobAction) {
    setActionError(null);
    setPendingAction({ jobId, action });
    try {
      if (action === 'cancel') await cancelJob(jobId);
      else if (action === 'trigger') await triggerJob(jobId);
      else if (action === 'pause') await pauseJob(jobId);
      else if (action === 'resume') await resumeJob(jobId);
      else if (action === 'stop') await stopJob(jobId);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('jobs.actionFailed'));
    } finally {
      setPendingAction(null);
    }
  }

  const pruneJob = useMemo(() => findPruneJob(jobs), [jobs]);
  const statusLabel = (status: string) => (isKnownStatus(status) ? t(`jobs.status_${status}`) : status);
  const triggerLabel = (type: string) => ((JOB_TRIGGER_TYPES as readonly string[]).includes(type) ? t(`jobs.trigger_${type as (typeof JOB_TRIGGER_TYPES)[number]}`) : type);
  const jobOf = (jobId: string) => jobs.find(j => j.id === jobId);
  const canDelete = (run: JobRunDto) => run.status !== 'running' && offers(jobOf(run.jobId), 'delete-runs');
  const canRunAgain = (run: JobRunDto) => outcomeOf(run.status) === 'failed' && offers(jobOf(run.jobId), 'trigger');

  function reloadRuns() {
    runsResult.reload();
    statsResult.reload();
    refetch();
  }

  /** The run whose job is being triggered again (its segment spins). */
  const [rerunning, setRerunning] = useState<string | null>(null);

  async function handleRunAgain(e: React.MouseEvent, run: JobRunDto) {
    e.stopPropagation();
    setActionError(null);
    setNotice(null);
    setRerunning(run.id);
    try {
      await triggerJob(run.jobId);
      setNotice(t('jobs.runAgainStarted', { job: run.jobName || run.jobId }));
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('jobs.actionFailed'));
    } finally {
      setRerunning(null);
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
    void confirm({
      title: t('jobs.deleteRunTitle'),
      message: t('jobs.deleteRunConfirm'),
      confirmLabel: t('jobs.deleteRun'),
      tone: 'danger',
      onConfirm: () => deleteRuns([run]),
    });
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
    // The runs are on their way: placeholder bars the size of the strip, so the column does not jump
    if (statsPending) {
      return (
        <SkeletonGroup label={t('jobs.lastRuns')} className="flex items-center gap-2">
          <span className="flex items-end">
            {Array.from({ length: STRIP_RUNS }, (_, i) => <span key={i} className="px-px py-1"><Skeleton className="block w-1.5 h-3.5 rounded-sm" /></span>)}
          </span>
          <Skeleton className="h-3 w-8" />
        </SkeletonGroup>
      );
    }
    const summary = insights?.jobs.get(job.id);
    const recent = (summary?.recent ?? []).slice(0, STRIP_RUNS).reverse();
    if (!summary || recent.length === 0) return <span className="text-xs text-subtle">—</span>;
    const rate = summary.successRate;
    return (
      <div className="flex items-center gap-2">
        <RunStrip jobId={job.id} runs={recent} />
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
          {job.tags && job.tags.length > 0 && <JobTags tags={job.tags} max={3} label={t('jobs.tags')} title={t('jobs.tagsOf', { name: job.name })} />}
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
      render: (job: JobDto) => {
        const running = runningSummary(job);
        return (
          <div className="flex flex-col items-start gap-0.5">
            <Badge variant={jobStatusVariant(job.status)} dot>{statusLabel(job.status)}</Badge>
            {running && <span className="text-[11px] text-muted whitespace-nowrap">{t(running.key, running.params)}</span>}
          </div>
        );
      },
    },
    // Also while the runs load (placeholder bars), so the column does not appear later and shift the table
    ...(insights || statsPending ? [{
      key: 'lastRuns',
      header: t('jobs.lastRuns'),
      render: renderStrip,
      sortValue: (job: JobDto) => insights?.jobs.get(job.id)?.successRate,
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
        <div onClick={e => e.stopPropagation()}>
          <JobActionGroup
            job={job}
            onAction={(action, e) => handleAction(e, job.id, action)}
            pending={pendingAction?.jobId === job.id ? pendingAction.action : null}
            labels="xl"
          />
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
        <Link to={`/${encodeURIComponent(run.jobId)}`} onClick={e => e.stopPropagation()} className="text-text hover:text-accent">
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
        ? (
          <button
            onClick={e => { e.stopPropagation(); setDetailsRun(run); }}
            title={t('jobs.runShowError')}
            className="text-xs text-error truncate max-w-[320px] block text-left hover:underline"
          >
            {run.error}
          </button>
        )
        : <span className="text-subtle">—</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (run: JobRunDto) => (
        <div className="flex justify-end" onClick={e => e.stopPropagation()}>
          <ButtonGroup
            label={t('components.rowActions', { name: `${run.jobName || run.jobId} ${formatDate(run.startedAt)}` })}
            labels="xl"
            items={[
              { key: 'details', label: t('jobs.runDetails'), icon: <DetailsIcon />, onClick: () => setDetailsRun(run) },
              ...(canRunAgain(run) ? [{
                key: 'again', label: t('jobs.runAgain'), icon: <RunAgainIcon />, tone: 'primary' as const,
                loading: rerunning === run.id, onClick: (e: React.MouseEvent) => void handleRunAgain(e, run),
              }] : []),
              ...(canDelete(run) ? [{
                key: 'delete', label: t('jobs.deleteRun'), icon: <DeleteIcon />, tone: 'danger' as const,
                disabled: deleting, onClick: (e: React.MouseEvent) => handleDeleteRun(e, run),
              }] : []),
            ]}
          />
        </div>
      ),
    },
  ];
  const deletableListed = listedRuns.filter(canDelete);

  // Counted from loaded runs, and not all of them could be loaded
  const filterCount = activeFilterCount({ search, status, group, tags: selectedTags, range });
  const truncated = !fromServer && runsReady && runsReady.total > runsReady.runs.length;
  const listTruncated = runsReady && runsReady.total > runsReady.runs.length;
  // Runs per result for the status buttons: only when every run of the view is loaded, so the numbers are whole
  const outcomeCounts = useMemo(() => {
    if (!runsReady || listTruncated) return null;
    const inWindow = selectedBucket
      ? runs.filter(r => { const time = Date.parse(r.startedAt); return time >= selectedBucket.start && time < selectedBucket.end; })
      : runs;
    const counts: Record<'all' | Outcome, number> = { all: inWindow.length, succeeded: 0, failed: 0, cancelled: 0, running: 0 };
    for (const r of inWindow) counts[outcomeOf(r.status)]++;
    return counts;
  }, [runsReady, listTruncated, runs, selectedBucket]);

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
      <div className="p-4 sm:p-6 space-y-5">
        {/* Filters: one row, scoping everything below; they fold away to a button with the number set */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            aria-expanded={filtersOpen}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-colors ${
              filterCount > 0 ? 'bg-primary/20 text-accent border-primary/40' : 'bg-surface/75 text-muted border-border/75 hover:text-text'
            }`}
          >
            <span aria-hidden className="text-[9px]">{filtersOpen ? '▼' : '▶'}</span>
            {t('jobs.filters')}
            {filterCount > 0 && <span className="tabular-nums" aria-label={t('jobs.filtersActive', { count: filterCount })}>({filterCount})</span>}
          </button>
          {filtersOpen && (
            <>
              <input
                type="search"
                placeholder={t('jobs.searchJobs')}
                aria-label={t('jobs.searchJobs')}
                value={search}
                onChange={e => setParam('q', e.target.value)}
                className={`w-full sm:w-56 placeholder-subtle ${CONTROL}`}
              />
              <div className="flex items-center gap-1 flex-wrap" role="group" aria-label={t('jobs.status')}>
                {/* Every status, also those no job has right now (dimmed), so the filter is always there to see */}
                {JOB_STATUS_FILTERS.map(s => (
                  <button
                    key={s}
                    onClick={() => setParam('status', s === 'all' ? null : s)}
                    aria-pressed={status === s}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                      status === s
                        ? 'bg-primary/20 text-accent border-primary/40'
                        : `bg-surface/75 text-muted border-border/75 hover:text-text ${s !== 'all' && statusCounts[s] === 0 ? 'opacity-60' : ''}`
                    }`}
                  >
                    {t(`jobs.statusFilter_${s}`)} <span className="tabular-nums text-subtle">{statusCounts[s]}</span>
                  </button>
                ))}
              </div>
              {tags.length > 0 && (
                <MultiSelect
                  label={t('jobs.filterByTag')}
                  placeholder={t('jobs.anyTag')}
                  options={tags.map(tag => ({
                    value: tag,
                    label: `#${tag}`,
                    icon: <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: tagStyle(tag, true).backgroundColor }} />,
                  }))}
                  value={tags.filter(isTagSelected)}
                  onChange={setTags}
                  clearable
                />
              )}
              {groups.length > 0 && (
                <Select
                  label={t('jobs.group')}
                  options={[{ value: '', label: t('jobs.allGroups') }, ...groups.map(g => ({ value: g, label: g }))]}
                  value={group}
                  onChange={g => setParam('group', g || null)}
                  onClear={group ? () => setParam('group', null) : undefined}
                />
              )}
              <Select
                label={t('jobs.range')}
                options={RUN_RANGES.map(r => ({ value: r, label: t(`jobs.range_${r}`) }))}
                value={range}
                onChange={r => setParam('range', r === '24h' ? null : r)}
              />
            </>
          )}
          {filtersSet && (
            <button onClick={clearFilters} className="text-xs text-accent hover:underline">{t('jobs.clearFilters')}</button>
          )}
        </div>

        {error && <ErrorState error={error} onRetry={refetch} />}
        {actionError && (
          <div className="text-error text-sm p-3 bg-error/10 border border-error/20 rounded-lg">
            {actionError}
          </div>
        )}
        {pruneJob && <PruneStatus job={pruneJob} statusLabel={statusLabel} />}

        {/* Run statistics: only on servers that list runs across jobs */}
        {runsResult.state === 'error' && <ErrorState title={t('jobs.runsError', { message: errorText(runsResult.message) })} onRetry={() => void runsResult.reload()} />}
        {statsResult.state === 'error' && <ErrorState title={t('jobs.runsError', { message: errorText(statsResult.message) })} />}
        {statsPending && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SkeletonStatCards count={4} inRow />
          </div>
        )}
        {insights && stats && (
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
        )}

        {/* Jobs and their recent runs, one at a time */}
        <div role="tablist" aria-label={t('jobs.views')} className="flex items-center gap-1 border-b border-border/75">
          {JOBS_TABS.map(name => (
            <button
              key={name}
              role="tab"
              aria-selected={tab === name}
              onClick={() => setParam('tab', name === 'jobs' ? null : name)}
              className={`-mb-px px-3 py-2 text-sm border-b-2 transition-colors ${
                tab === name ? 'border-primary text-heading font-medium' : 'border-transparent text-muted hover:text-text'
              }`}
            >
              {name === 'jobs' ? t('nav.jobs') : t('jobs.recentRuns')}{' '}
              <span className="text-xs tabular-nums text-subtle">
                {name === 'jobs' ? formatNumber(filteredJobs.length) : runsTotal !== null ? formatNumber(runsTotal) : ''}
              </span>
            </button>
          ))}
        </div>

        {tab === 'jobs' && loading && !data && <SkeletonTable rows={6} columns={columns.length} label={t('jobs.loadingJobs')} />}
        {tab === 'jobs' && data && (
          filteredJobs.length === 0 && jobs.length > 0 ? (
            <EmptyState
              className="bg-surface border border-border rounded-xl"
              message={t('jobs.noMatches')}
              action={<button onClick={clearFilters} className="text-sm text-accent hover:underline">{t('jobs.clearFilters')}</button>}
            />
          ) : (
            <div>
              <DataTable
                columns={columns}
                data={filteredJobs}
                page={{ index: jobsPage, size: jobsPaging.pageSize }}
                keyExtractor={job => job.id}
                onRowClick={job => navigate(`/${job.id}`)}
              />
              <Pagination
                page={jobsPage}
                pageSize={jobsPaging.pageSize}
                total={filteredJobs.length}
                onPage={jobsPaging.setPage}
                onPageSize={jobsPaging.setPageSize}
              />
            </div>
          )
        )}

        {tab === 'runs' && runsResult.state === 'unavailable' && <div className="text-xs text-subtle">{t('jobs.runsUnavailable')}</div>}
        {tab === 'runs' && statsPending && <SkeletonChartCard height={180} label={t('jobs.runsChart')} />}
        {tab === 'runs' && insights && stats && (
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
        )}

        {tab === 'runs' && runsReady && (
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-3">
                {selectedBucket && (
                  <span className="inline-flex items-center gap-2 text-xs text-muted bg-control rounded-lg px-2 py-1">
                    {windowLabel(selectedBucket.start, selectedBucket.end)}
                    <button onClick={() => setParam('at', null)} className="text-accent hover:underline">{t('jobs.clearWindow')}</button>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {!runsQuery && listTruncated && (
                  <span className="text-xs text-subtle">{t('jobs.listLatest', { shown: formatNumber(runsReady.runs.length) })}</span>
                )}
                <div className="flex items-center gap-1 flex-wrap" role="group" aria-label={t('jobs.status')}>
                  {(['all', ...OUTCOMES] as const).map(o => {
                    const selected = o === 'all' ? !outcome : outcome === o;
                    return (
                      <button
                        key={o}
                        onClick={() => setParam('result', o === 'all' ? null : o)}
                        aria-pressed={selected}
                        className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                          selected
                            ? 'bg-primary/20 text-accent border-primary/40'
                            : `bg-surface/75 text-muted border-border/75 hover:text-text ${outcomeCounts && o !== 'all' && outcomeCounts[o] === 0 ? 'opacity-60' : ''}`
                        }`}
                      >
                        {o === 'all' ? t('jobs.statusFilter_all') : t(`jobs.outcome_${o}`)}
                        {outcomeCounts && <> <span className="tabular-nums text-subtle">{outcomeCounts[o]}</span></>}
                      </button>
                    );
                  })}
                </div>
                {/* Only with a result or a column picked, so a click never clears every run of every job */}
                {(outcome || selectedBucket) && deletableListed.length > 0 && (
                  <button
                    onClick={() => {
                      const listed = deletableListed;
                      void confirm({
                        title: t('jobs.deleteRunsTitle'),
                        message: t('jobs.deleteListedConfirm', { count: listed.length }),
                        confirmLabel: t('jobs.deleteListed', { count: listed.length }),
                        tone: 'danger',
                        onConfirm: () => deleteRuns(listed),
                      });
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
            {runsPage.state === 'error' && <ErrorState className="mb-3" title={t('jobs.runsError', { message: errorText(runsPage.message) })} />}
            {runsTotal === null ? (
              runsPage.state !== 'error' && <SkeletonTable rows={6} columns={runColumns.length} />
            ) : runsTotal === 0 ? (
              <EmptyState className="bg-surface border border-border rounded-xl" message={t('jobs.noRuns')} />
            ) : (
              <>
                {runsQuery ? (
                  <DataTable
                    columns={runColumns}
                    data={serverRuns?.items ?? []}
                    keyExtractor={run => run.id}
                    onRowClick={run => navigate(`/${encodeURIComponent(run.jobId)}`)}
                  />
                ) : (
                  <DataTable
                    columns={runColumns}
                    data={listedRuns}
                    page={{ index: clampPage(runsPaging.page, listedRuns.length, runsPaging.pageSize), size: runsPaging.pageSize }}
                    keyExtractor={run => run.id}
                    onRowClick={run => navigate(`/${encodeURIComponent(run.jobId)}`)}
                  />
                )}
                <Pagination
                  page={runsPaging.page}
                  pageSize={runsPaging.pageSize}
                  total={runsTotal}
                  onPage={runsPaging.setPage}
                  onPageSize={runsPaging.setPageSize}
                />
              </>
            )}
          </section>
        )}
      </div>

      <RunDetailsModal
        run={detailsRun}
        onClose={() => setDetailsRun(null)}
        statusBadge={status => <Badge variant={OUTCOME_VARIANT[outcomeOf(status)]} dot>{statusLabel(status)}</Badge>}
        triggerLabel={triggerLabel}
      />
      {dialog}
    </div>
  );
}
