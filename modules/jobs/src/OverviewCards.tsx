import {
  ChartCard,
  ChartLegend,
  ColumnChart,
  SkeletonChartCard,
  SkeletonStatCard,
  StatCard,
  spreadTicks,
  useAsync,
  useDashboard,
  useLiveReload,
} from '@qodalis/cli-server-dashboard-kit';
import { getJobs } from './api';
import { useI18n } from './i18n';
import { OUTCOMES, OUTCOME_COLORS } from './jobInsights';
import { useBoundFetch } from './overview';
import { useJobInsights } from './useJobInsights';

/** Overview: the jobs the scheduler has. */
export function ActiveJobsCard() {
  useBoundFetch();
  const { t, formatNumber } = useI18n();
  const { data: jobs, loading, refresh } = useAsync(getJobs, []);
  useLiveReload('job:*', refresh);
  if (loading && !jobs) return <SkeletonStatCard label={t('overview.activeJobs')} />;
  return (
    <StatCard
      label={t('overview.activeJobs')}
      value={jobs ? formatNumber(jobs.length) : '—'}
      sub={t('overview.registeredJobs')}
    />
  );
}

/** Overview: the runs of the last 24 hours by hour and result; a column opens the jobs at that hour. */
export function RunsChartCard() {
  useBoundFetch();
  const { navigate } = useDashboard();
  const { t, formatDate, formatNumber } = useI18n();
  const { insights, reloading, loading } = useJobInsights('24h', true);
  // Its place (title, legend, 140px chart) is held while the numbers load
  if (!insights) return loading ? <SkeletonChartCard height={162} label={t('jobs.runsChart')} /> : null;
  const buckets = insights.buckets;
  const totals = insights.stats;
  return (
    <ChartCard
      title={`${t('jobs.runsChart')} · ${t('jobs.range_24h')}`}
      note={totals.successRate !== null
        ? `${t('jobs.successRate')}: ${formatNumber(totals.successRate, { style: 'percent', maximumFractionDigits: 1 })}`
        : undefined}
      legend={<ChartLegend items={OUTCOMES.map(o => ({ label: t(`jobs.outcome_${o}`), color: OUTCOME_COLORS[o], value: formatNumber(totals[o]) }))} />}
      actions={
        <button type="button" onClick={() => navigate('/')} className="text-xs text-accent hover:underline transition-colors">
          {t('overview.viewAll')}
        </button>
      }
    >
      <ColumnChart
        columns={buckets.map(bucket => ({
          key: String(bucket.start),
          segments: OUTCOMES.map(o => ({ key: o, value: bucket.counts[o], color: OUTCOME_COLORS[o] })),
          title: `${formatDate(bucket.start, { hour: '2-digit', minute: '2-digit' })} – ${formatDate(bucket.end, { hour: '2-digit', minute: '2-digit' })}`,
          rows: OUTCOMES.filter(o => bucket.counts[o] > 0 || o === 'succeeded' || o === 'failed').map(o => ({
            label: t(`jobs.outcome_${o}`), value: formatNumber(bucket.counts[o]), color: OUTCOME_COLORS[o],
          })),
          ariaLabel: t('jobs.columnAria', { time: formatDate(bucket.start), total: bucket.total, failed: bucket.counts.failed }),
        }))}
        xTicks={spreadTicks(buckets.length, 6).map(i => ({ index: i, label: formatDate(buckets[i].start, { hour: '2-digit', minute: '2-digit' }) }))}
        formatValue={v => formatNumber(v, { notation: 'compact' })}
        integer
        height={140}
        onSelect={key => key && navigate(`/?at=${key}`)}
        stale={reloading}
        ariaLabel={t('jobs.runsChart')}
      />
    </ChartCard>
  );
}
