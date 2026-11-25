import { useEffect, useMemo, useState } from 'react';
import {
  Badge, ChartCard, ChipList, ChartLegend, ColumnChart, DataTable, ErrorState, PageHeader, Pagination, Select, SkeletonChartCard, SkeletonList,
  SkeletonStatCards, SkeletonTable, StatCard, spreadTicks, useApi, useAsync, useLiveReload, usePaging, useQueryParams,
} from '@qodalis/cli-server-dashboard-kit';
import { auditToCsv, formatProperties, getAudit } from './api';
import type { AuditEntryDto } from './types';
import { useI18n, type MessageKey } from './i18n';
import {
  AUDIT_KINDS, AUDIT_KIND_COLORS, AUDIT_RANGES, auditEntryKind, auditRangeStart, auditStats, bucketAudit, matchesAuditFilters, matchesAuditText, topValues,
  type AuditKind, type AuditRange,
} from './auditInsights';
import AuditEventFacts from './AuditEventFacts';
import { DETAILED_EVENTS } from './auditEventDetails';

/** Entries one request may return (the servers' maximum). */
const MAX_ENTRIES = 1000;
/** Typing in a filter asks the server once it pauses. */
const FILTER_DELAY = 400;

const KIND_VARIANT: Record<AuditKind, 'error' | 'warning' | 'info' | 'neutral'> = {
  failure: 'error',
  removal: 'warning',
  access: 'info',
  other: 'neutral',
};

const KIND_LABELS: Record<AuditKind, MessageKey> = {
  failure: 'audit.kindFailure',
  removal: 'audit.kindRemoval',
  access: 'audit.kindAccess',
  other: 'audit.kindOther',
};

const INPUT = 'px-2.5 py-1.5 text-xs bg-control border border-border rounded-lg text-text placeholder:text-subtle w-40 focus:outline-none focus:border-primary';

const STATS_GRID = 'grid grid-cols-2 lg:grid-cols-4 gap-4';

const isRange = (value: string | null): value is AuditRange => AUDIT_RANGES.includes(value as AuditRange);

/** Waits for `value` to stop changing. */
function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/** The audit log: activity over time, who and what is most frequent, filters kept in the URL, CSV export. */
export default function AuditPage() {
  const { t, formatDate, formatNumber } = useI18n();
  const api = useApi();
  const [params, setParams] = useQueryParams();
  const event = params.get('event') ?? '';
  const actor = params.get('actor') ?? '';
  const user = params.get('user') ?? '';
  const text = params.get('q') ?? '';
  const range: AuditRange = isRange(params.get('range')) ? params.get('range') as AuditRange : '7d';
  const at = Number(params.get('at')) || null;
  // Paged by the kit's controls; new filters or a new range go back to the first page
  const { page, setPage, pageSize, setPageSize } = usePaging('qcli_admin_audit_page_size', [event, actor, user, text, range, at ?? ''].join('\n'));

  const setParam = (name: string, value: string | null) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(name, value);
      else next.delete(name);
      if (name === 'range') next.delete('at');
      return next;
    });
  };
  const filtersSet = !!(event || actor || user || text || at);
  const clear = () => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      ['event', 'actor', 'user', 'q', 'at'].forEach(name => next.delete(name));
      return next;
    });
  };

  // The server filters by event and user (exactly) and time; the text search runs over what it sent
  const serverQuery = useSettled(JSON.stringify({ event, actor, username: user, range }), FILTER_DELAY);
  const { data, loading, error, refetch, refresh } = useAsync(async () => {
    const query = JSON.parse(serverQuery) as { event: string; actor: string; username: string; range: AuditRange };
    const now = Date.now();
    const start = auditRangeStart(query.range, now);
    const entries = await getAudit(api, {
      event: query.event, actor: query.actor, username: query.username,
      from: start !== null ? new Date(start).toISOString() : undefined,
      limit: MAX_ENTRIES,
    });
    // Servers before 1.0.0-beta.19 ignore `from`
    return { entries: start !== null ? entries.filter(e => e.timestamp >= start) : entries, loadedAt: now, full: entries.length >= MAX_ENTRIES };
  }, [api, serverQuery]);

  // New entries of the filtered list: reload while the newest page is shown; on later pages the rows would shift
  // under the reader, so the reload waits until they return to the first page
  useLiveReload('audit:recorded', refresh, {
    filter: entry => matchesAuditFilters(entry, { event, actor, user }),
    paused: page > 0,
  });

  const matching = useMemo(() => (data?.entries ?? []).filter(e => matchesAuditText(e, text)), [data, text]);
  const buckets = useMemo(() => (data ? bucketAudit(matching, range, data.loadedAt) : []), [data, matching, range]);
  const picked = at !== null ? buckets.find(b => b.start === at) ?? null : null;
  const shown = picked ? matching.filter(e => e.timestamp >= picked.start && e.timestamp < picked.end) : matching;
  const pageEntries = shown.slice(page * pageSize, (page + 1) * pageSize);
  const kindCounts = useMemo(() => {
    const counts: Record<AuditKind, number> = { failure: 0, removal: 0, access: 0, other: 0 };
    matching.forEach(e => counts[auditEntryKind(e)]++);
    return counts;
  }, [matching]);
  const topEvents = useMemo(() => topValues(matching, e => e.event), [matching]);
  const topActors = useMemo(() => topValues(matching, e => e.actor), [matching]);
  const stats = useMemo(() => (data ? auditStats(matching, data.loadedAt) : null), [data, matching]);
  const knownEvents = useMemo(() => [...new Set((data?.entries ?? []).map(e => e.event))].sort(), [data]);

  const daily = range === '30d' || range === 'all';
  const tick = (time: number) => formatDate(time, daily ? { month: 'short', day: 'numeric' } : range === '7d' ? { weekday: 'short', hour: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
  const span = (start: number, end: number) => `${formatDate(start, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} – ${formatDate(end, daily ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' })}`;

  function exportCsv() {
    const blob = new Blob([auditToCsv(shown)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns = [
    {
      key: 'timestamp',
      header: t('audit.time'),
      sortValue: (e: AuditEntryDto) => e.timestamp,
      render: (e: AuditEntryDto) => <span className="text-xs text-muted whitespace-nowrap">{formatDate(e.timestamp)}</span>,
    },
    {
      key: 'event',
      header: t('audit.event'),
      sortValue: (e: AuditEntryDto) => e.event,
      render: (e: AuditEntryDto) => (
        <button onClick={() => setParam('event', e.event)} title={t('audit.filterBy', { value: e.event })}>
          <Badge variant={KIND_VARIANT[auditEntryKind(e)]}>{e.event}</Badge>
        </button>
      ),
    },
    {
      key: 'actor',
      header: t('audit.actor'),
      sortValue: (e: AuditEntryDto) => e.actor,
      render: (e: AuditEntryDto) => e.actor
        ? <button onClick={() => setParam('actor', e.actor!)} className="text-xs hover:text-accent" title={t('audit.filterBy', { value: e.actor })}>{e.actor}</button>
        : <span className="text-xs">—</span>,
    },
    {
      key: 'subject',
      header: t('audit.subject'),
      sortValue: (e: AuditEntryDto) => e.username || e.target,
      render: (e: AuditEntryDto) => (
        <span className="text-xs">
          {e.username ? <button onClick={() => setParam('user', e.username)} className="hover:text-accent">{e.username}</button> : null}
          {e.username && e.target ? ' · ' : null}
          {e.target ? <span className="font-mono text-muted">{e.target}</span> : null}
          {!e.username && !e.target ? '—' : null}
        </span>
      ),
    },
    {
      key: 'details',
      header: t('audit.details'),
      render: (e: AuditEntryDto) => {
        const values = formatProperties(e.properties);
        // Data queries and terminal links: their metadata says more than the details text (the source, the client)
        const known = DETAILED_EVENTS.includes(e.event);
        return (
          <div className="text-xs max-w-[360px]">
            {known ? <AuditEventFacts entry={e} /> : e.details && <div className="text-muted truncate" title={e.details}>{e.details}</div>}
            {values.length > 0 && (
              <ChipList
                items={values.map(v => ({ key: v, label: v, title: v }))}
                max={3}
                className="mt-0.5"
                label={t('audit.details')}
                title={t('audit.detailsOf', { event: e.event })}
                chipClassName="block font-mono text-[11px] bg-control px-1.5 py-0.5 rounded truncate max-w-[200px]"
              />
            )}
            {!known && !e.details && values.length === 0 && <span className="text-subtle">—</span>}
          </div>
        );
      },
    },
    {
      key: 'address',
      header: t('audit.address'),
      sortValue: (e: AuditEntryDto) => e.metadata?.remoteAddress,
      render: (e: AuditEntryDto) => <span className="text-xs font-mono text-subtle">{e.metadata?.remoteAddress ?? '—'}</span>,
    },
  ];

  const topList = (title: string, items: { value: string; count: number }[], param: string) => (
    <div className="bg-surface border border-border rounded-xl p-4">
      <h3 className="text-sm font-semibold text-heading mb-2">{title}</h3>
      {items.length === 0 ? <div className="text-xs text-subtle">—</div> : (
        <ul className="space-y-1.5">
          {items.map(item => (
            <li key={item.value}>
              <button onClick={() => setParam(param, item.value)} className="w-full flex items-center gap-2 text-xs group">
                <span className="truncate text-text group-hover:text-accent">{item.value}</span>
                <span className="flex-1 h-1.5 rounded-full bg-control overflow-hidden" aria-hidden>
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(item.count / items[0].count) * 100}%` }} />
                </span>
                <span className="tabular-nums text-muted w-10 text-right">{formatNumber(item.count)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title={t('audit.title')}
        subtitle={data ? t('audit.subtitleCount', { count: shown.length }) : t('audit.subtitle')}
        actions={
          <>
            <button onClick={exportCsv} disabled={shown.length === 0} className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors disabled:opacity-40">
              {t('audit.exportCsv')}
            </button>
            <button onClick={refetch} className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors">
              {t('audit.refresh')}
            </button>
          </>
        }
      />
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" aria-label={t('audit.search')} placeholder={t('audit.search')} className={`${INPUT.replace('w-40', '')} w-full sm:w-56`}
            value={text} onChange={e => setParam('q', e.target.value || null)} />
          <input list="audit-events" aria-label={t('audit.filterEvent')} placeholder={t('audit.filterEvent')} className={INPUT}
            value={event} onChange={e => setParam('event', e.target.value || null)} />
          <datalist id="audit-events">{knownEvents.map(name => <option key={name} value={name} />)}</datalist>
          <input aria-label={t('audit.filterActor')} placeholder={t('audit.filterActor')} className={INPUT}
            value={actor} onChange={e => setParam('actor', e.target.value || null)} />
          <input aria-label={t('audit.filterUser')} placeholder={t('audit.filterUser')} className={INPUT}
            value={user} onChange={e => setParam('user', e.target.value || null)} />
          <Select
            label={t('audit.range')}
            options={AUDIT_RANGES.map(r => ({ value: r, label: t(`audit.range_${r}`) }))}
            value={range}
            onChange={r => setParam('range', r === '7d' ? null : r)}
          />
          {filtersSet && (
            <button type="button" onClick={clear} className="text-xs text-accent hover:underline">{t('audit.clearFilters')}</button>
          )}
        </div>

        {loading && !data && (
          <>
            <div className={STATS_GRID}>
              <SkeletonStatCards count={4} inRow label={t('audit.statsLoading')} />
            </div>
            <SkeletonChartCard height={162} label={t('audit.loading')} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[0, 1].map(i => (
                <div key={i} className="bg-surface border border-border rounded-xl p-4">
                  <SkeletonList items={4} />
                </div>
              ))}
            </div>
            <SkeletonTable rows={6} columns={columns.length} />
          </>
        )}
        {error && <ErrorState error={error} onRetry={refetch} />}

        {data && stats && (
          <>
            <section aria-label={t('audit.statistics')} className={STATS_GRID}>
              <StatCard
                label={t('audit.statsEvents')}
                value={`${formatNumber(stats.events)}${data.full ? '+' : ''}`}
                sub={t('audit.statsEventsSub', { range: t(`audit.range_${range}`), today: formatNumber(stats.today) })}
              />
              <StatCard
                label={t('audit.statsActors')}
                value={formatNumber(stats.actors)}
                sub={stats.topActor ? t('audit.statsTopActor', { name: stats.topActor }) : t('audit.statsNone')}
              />
              <StatCard
                label={t('audit.statsSignIns')}
                value={formatNumber(stats.signIns)}
                sub={stats.failedSignIns > 0 ? t('audit.statsFailed', { count: stats.failedSignIns }) : t('audit.statsNoneFailed')}
                subColor={stats.failedSignIns > 0 ? 'text-error' : undefined}
              />
              <StatCard
                label={t('audit.statsChanges')}
                value={formatNumber(stats.changes)}
                sub={stats.topChange ? t('audit.statsTopChange', { name: stats.topChange }) : t('audit.statsNoChanges')}
              />
            </section>

            <ChartCard
              title={t('audit.activity')}
              note={<>
                {t('audit.activityNote')}
                {data.full && <> · {t('audit.latestOnly', { shown: formatNumber(MAX_ENTRIES) })}</>}
              </>}
              legend={<ChartLegend items={AUDIT_KINDS.map(k => ({ label: t(KIND_LABELS[k]), color: AUDIT_KIND_COLORS[k], value: formatNumber(kindCounts[k]) }))} />}
            >
              <ColumnChart
                columns={buckets.map(b => ({
                  key: String(b.start),
                  segments: AUDIT_KINDS.map(k => ({ key: k, value: b.counts[k], color: AUDIT_KIND_COLORS[k] })),
                  title: span(b.start, b.end),
                  rows: AUDIT_KINDS.filter(k => b.counts[k] > 0).map(k => ({ label: t(KIND_LABELS[k]), value: formatNumber(b.counts[k]), color: AUDIT_KIND_COLORS[k] })),
                  ariaLabel: t('audit.columnAria', { time: span(b.start, b.end), total: b.total, failures: b.counts.failure }),
                }))}
                xTicks={spreadTicks(buckets.length, 6).map(i => ({ index: i, label: tick(buckets[i].start) }))}
                formatValue={v => formatNumber(v, { notation: 'compact' })}
                integer
                height={140}
                selectedKey={picked ? String(picked.start) : null}
                onSelect={key => setParam('at', key)}
                stale={loading}
                ariaLabel={t('audit.activity')}
              />
            </ChartCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {topList(t('audit.topEvents'), topEvents, 'event')}
              {topList(t('audit.topActors'), topActors, 'actor')}
            </div>

            {picked && (
              <div className="inline-flex items-center gap-2 text-xs text-muted bg-control rounded-lg px-2 py-1">
                {span(picked.start, picked.end)}
                <button onClick={() => setParam('at', null)} className="text-accent hover:underline">{t('audit.clearWindow')}</button>
              </div>
            )}
            {!error && <DataTable columns={columns} data={pageEntries} keyExtractor={e => e.id} />}

            <Pagination page={page} pageSize={pageSize} total={shown.length} onPage={setPage} onPageSize={setPageSize} />
          </>
        )}
      </div>
    </div>
  );
}
