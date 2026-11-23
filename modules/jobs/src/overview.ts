import {
  createTranslations,
  useDashboard,
  type AttentionItem,
  type DashboardExtensionContext,
  type PaletteEntry,
} from '@qodalis/cli-server-dashboard-kit';
import { ApiError, bindFetch } from './client';
import { getJobs, getJobStats, getRecentRuns } from './api';
import { messages } from './messages';
import {
  RANGE_SPEC,
  insightsFromRuns,
  insightsFromStats,
  outcomeOf,
  rangeSince,
  rangeUntil,
  type JobInsights,
} from './jobInsights';

/** Failing jobs listed in "Needs attention", worst first. */
const MAX_FAILING = 5;

/** The page's path of a job. */
export const jobPath = (id: string) => `/${encodeURIComponent(id)}`;

/** Binds the module's requests to the dashboard's `fetch` of the context it renders in. */
export function useBoundFetch(): void {
  bindFetch(useDashboard().fetch);
}

/** The last 24 hours' statistics: the server's own, or counted from its runs (servers before 1.0.0-beta.19). */
async function insights24h(now = Date.now()): Promise<JobInsights> {
  try {
    const response = await getJobStats({ since: rangeSince('24h', now), until: rangeUntil('24h', now), buckets: RANGE_SPEC['24h'].buckets });
    if (Array.isArray(response?.buckets) && Array.isArray(response.jobs) && response.totals) return insightsFromStats(response);
  } catch (err) {
    if (!(err instanceof ApiError && (err.status === 404 || err.status === 501))) throw err;
  }
  const { runs } = await getRecentRuns({ since: rangeSince('24h', now) }, 500);
  return insightsFromRuns(runs, '24h', now);
}

/** "Needs attention": jobs whose runs failed in the last 24 hours, the worst first. */
export async function failingJobs(context: DashboardExtensionContext): Promise<AttentionItem[]> {
  bindFetch(context.fetch);
  const { t, formatNumber } = createTranslations(messages, context.language);
  const [insights, jobs] = await Promise.all([insights24h(), getJobs().catch(() => [])]);
  const names = new Map(jobs.map(job => [job.id, job.name]));
  return [...insights.jobs.entries()]
    .filter(([, summary]) => summary.successRate !== null && summary.successRate < 1)
    .sort(([, a], [, b]) => (a.successRate ?? 1) - (b.successRate ?? 1))
    .slice(0, MAX_FAILING)
    .map(([jobId, summary]) => ({
      id: jobId,
      level: 'error' as const,
      title: names.get(jobId) ?? jobId,
      detail: `${t('overview.jobFailing', { rate: formatNumber(summary.successRate ?? 0, { style: 'percent', maximumFractionDigits: 1 }) })} · ${t('overview.inLast24h')}`,
      time: summary.recent.find(run => outcomeOf(run.status) === 'failed')?.startedAt,
      path: jobPath(jobId),
    }));
}

/** The command palette: every job, to jump to it. */
export async function jobEntries(context: DashboardExtensionContext): Promise<PaletteEntry[]> {
  bindFetch(context.fetch);
  const jobs = await getJobs();
  return jobs.map(job => ({
    id: job.id,
    label: job.name,
    hint: [job.group, job.id].filter(Boolean).join(' · '),
    icon: '⏱',
    path: jobPath(job.id),
  }));
}
