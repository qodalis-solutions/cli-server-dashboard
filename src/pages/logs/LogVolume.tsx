import { useEffect, useState } from 'react';
import ColumnChart from '../../components/charts/ColumnChart';
import { ChartCard, ChartLegend } from '../../components/charts/chartParts';
import { spreadTicks } from '../../components/charts/chartUtils';
import { ApiError } from '../../api/client';
import { getLogHistogram } from '../../api/logs';
import type { LogHistogramResponse } from '../../types';
import { useI18n } from '../../i18n';
import { ALL_LEVELS, histogramWindow, levelParam, type Level, type LogFilters } from './logFilters';

/** Level colors: errors and warnings in the status colors, info and debug recessive. */
const LEVEL_FILL: Record<Level, string> = {
  DEBUG: 'var(--qcli-subtle)',
  INFO: 'var(--qcli-info)',
  WARN: 'var(--qcli-warning)',
  ERROR: 'var(--qcli-error)',
};
/** Bottom to top: the levels that matter most sit on the baseline, easiest to compare. */
const STACK: Level[] = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
/** A live view's chart catches up this often. */
const LIVE_REFRESH_MS = 30_000;

interface Props {
  filters: LogFilters;
  /** The filters' text as the server is asked (after typing pauses). */
  search: string;
  /** A column was picked: show its time span. */
  onPick: (from: number, to: number) => void;
}

/**
 * Entries per level over the range, from the server's histogram (servers since 1.0.0-beta.19); nothing on servers
 * without one.
 */
export default function LogVolume({ filters, search, onPick }: Props) {
  const { t, formatDate, formatNumber } = useI18n();
  const [data, setData] = useState<LogHistogramResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const level = levelParam(filters.levels);
  const { range, customFrom, customTo, service } = filters;

  useEffect(() => {
    if (range !== 'live') return;
    const timer = setInterval(() => setTick(n => n + 1), LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [range]);

  useEffect(() => {
    if (unavailable) return;
    let cancelled = false;
    const window = histogramWindow({ range, customFrom, customTo });
    // State is only set from the request's callbacks
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getLogHistogram({
      level, search, service: service || undefined,
      from: new Date(window.from).toISOString(), to: new Date(window.to).toISOString(), buckets: window.buckets,
    })
      .then(response => { if (!cancelled) setData(response); })
      .catch(err => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 501)) setUnavailable(true);
        // Other failures keep the last chart; the list shows its own errors
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [level, search, service, range, customFrom, customTo, tick, unavailable]);

  if (unavailable || !data) return null;

  const multiDay = data.buckets.length > 0 && data.bucketMs * data.buckets.length > 36 * 3_600_000;
  const label = (time: number) => formatDate(time, multiDay ? { weekday: 'short', hour: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
  const span = (start: number) => `${formatDate(start, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} – ${formatDate(start + data.bucketMs, { hour: '2-digit', minute: '2-digit' })}`;
  const shown = ALL_LEVELS.filter(l => filters.levels.has(l));

  return (
    <ChartCard
      title={t('logs.volume')}
      note={t('logs.volumeNote')}
      legend={<ChartLegend items={shown.map(l => ({ label: l, color: LEVEL_FILL[l], value: formatNumber(data.totals[l] ?? 0) }))} />}
    >
      <ColumnChart
        columns={data.buckets.map(bucket => {
          const start = Date.parse(bucket.start);
          const total = shown.reduce((sum, l) => sum + (bucket[l] ?? 0), 0);
          return {
            key: String(start),
            segments: STACK.filter(l => filters.levels.has(l)).map(l => ({ key: l, value: bucket[l] ?? 0, color: LEVEL_FILL[l] })),
            title: span(start),
            rows: [...shown].reverse().map(l => ({ label: l, value: formatNumber(bucket[l] ?? 0), color: LEVEL_FILL[l] })),
            ariaLabel: t('logs.volumeColumn', { time: span(start), total, errors: bucket.ERROR ?? 0 }),
          };
        })}
        xTicks={spreadTicks(data.buckets.length, 6).map(i => ({ index: i, label: label(Date.parse(data.buckets[i].start)) }))}
        formatValue={v => formatNumber(v, { notation: 'compact' })}
        integer
        height={120}
        onSelect={key => { if (key) onPick(Number(key), Number(key) + data.bucketMs); }}
        stale={loading}
        ariaLabel={t('logs.volume')}
      />
    </ChartCard>
  );
}
