import './styles.css';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ApiError,
  Badge,
  ChartCard,
  ChartLegend,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LineChart,
  Modal,
  PageHeader,
  Pagination,
  SkeletonChartCard,
  SkeletonStatCards,
  SkeletonTable,
  StatCard,
  createApi,
  createTranslations,
  defineExtension,
  useApi,
  useDashboard,
  useServerEvents,
  useTranslations,
  type AttentionItem,
} from '@qodalis/cli-server-dashboard-kit';
import { messages } from './messages';
import {
  API,
  enc,
  formatBytes,
  qualified,
  rate,
  runDuration,
  type DatabaseDetail,
  type DatabaseStats,
  type DatabaseSummary,
  type MigrationState,
  type MigrationStatus,
  type Run,
  type RunSummary,
  type RunsPage,
} from './api';

const BUTTON = 'px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors disabled:opacity-40';
const PRIMARY_BUTTON = 'px-4 py-1.5 text-xs font-medium bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors disabled:opacity-40';
const LINK_BUTTON = 'text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline';
const RUN_PERMISSION = 'databases:migrate';
/** How often the overview samples the stats while it is open, and how many samples the charts keep (10 minutes). */
const SAMPLE_SECONDS = 10;
const MAX_SAMPLES = 60;

const useI18n = () => useTranslations(messages);
type T = ReturnType<typeof useI18n>['t'];

const STATUS_BADGE: Record<MigrationStatus, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  applied: 'success',
  pending: 'info',
  changed: 'warning',
  missing: 'warning',
  failed: 'error',
};

function statusLabel(t: T, status: MigrationStatus): string {
  const keys = { applied: 'statusApplied', pending: 'statusPending', changed: 'statusChanged', missing: 'statusMissing', failed: 'statusFailed' } as const;
  return t(`databases.${keys[status]}`);
}

function RunStatus({ run }: { run: Pick<RunSummary, 'status'> }) {
  const { t } = useI18n();
  if (run.status === 'running') return <Badge variant="info" dot>{t('databases.runRunning')}</Badge>;
  if (run.status === 'failed') return <Badge variant="error" dot>{t('databases.runFailedStatus')}</Badge>;
  return <Badge variant="success" dot>{t('databases.runSucceeded')}</Badge>;
}

function triggerLabel(t: T, trigger: string): string {
  const keys: Record<string, 'triggerStartup' | 'triggerApi' | 'triggerTerminal' | 'triggerMcp'> = {
    startup: 'triggerStartup',
    api: 'triggerApi',
    terminal: 'triggerTerminal',
    mcp: 'triggerMcp',
  };
  return keys[trigger] ? t(`databases.${keys[trigger]}`) : trigger;
}

/**
 * Loads `url` now, when it changes, and after a migration run (`databases:migration-run`). Only the latest request's
 * answer is kept (a slow answer for a previous page never replaces the current one); the last value stays while the
 * next loads (`loading`).
 */
function useLoad<V>(url: string) {
  const api = useApi();
  const [value, setValue] = useState<V | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const reload = useCallback(() => {
    const current = ++request.current;
    setLoading(true);
    api.get<V>(url).then(
      (v) => {
        if (current !== request.current) return;
        setValue(v);
        setError(null);
        setLoading(false);
      },
      (e: unknown) => {
        if (current !== request.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      },
    );
  }, [api, url]);
  useEffect(() => {
    // The request settles after this effect; its answer is set from the callbacks
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);
  useServerEvents('databases:migration-run', reload);
  return { value, error, loading, reload };
}

function Failure({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <ErrorState error={error} onRetry={onRetry} />;
}

/** The databases with their size, counts and last run. */
function DatabaseList() {
  const { navigate } = useDashboard();
  const { t, formatNumber, formatRelative } = useI18n();
  const { value: overview, error, reload } = useLoad<{ databases: DatabaseSummary[] }>(API);
  const value = overview?.databases ?? null;

  return (
    <>
      <PageHeader title={t('databases.title')} subtitle={t('databases.subtitle')} />
      <div className="p-4 sm:p-6 space-y-4">
        {error && <Failure error={error} onRetry={reload} />}
        {!value && !error && <SkeletonTable rows={3} columns={7} label={t('databases.loading')} />}
        {value && value.length === 0 && <EmptyState className="bg-surface border border-border rounded-xl" message={t('databases.noDatabases')} />}
        {value && value.length > 0 && (
          <DataTable
            data={value}
            keyExtractor={(d) => d.name}
            onRowClick={(d) => navigate(`/db/${enc(d.name)}`)}
            columns={[
              {
                key: 'name',
                header: t('databases.database'),
                sortValue: (d) => d.name,
                render: (d) => <span className="font-mono text-primary">{d.name}</span>,
              },
              { key: 'dialect', header: t('databases.dialect'), render: (d) => <Badge variant="neutral">{d.dialect}</Badge> },
              {
                key: 'size',
                header: t('databases.size'),
                sortValue: (d) => d.sizeBytes ?? -1,
                render: (d) => (d.sizeBytes !== undefined ? <span className="tabular-nums">{formatBytes(d.sizeBytes, formatNumber)}</span> : null),
              },
              {
                key: 'applied',
                header: t('databases.applied'),
                sortValue: (d) => d.applied,
                render: (d) => (d.error ? <span className="text-error text-xs">{t('databases.unavailable', { error: d.error })}</span> : formatNumber(d.applied)),
              },
              {
                key: 'pending',
                header: t('databases.pending'),
                sortValue: (d) => d.pending,
                render: (d) => (d.error ? null : d.pending > 0 ? <Badge variant="info">{formatNumber(d.pending)}</Badge> : formatNumber(0)),
              },
              {
                key: 'problems',
                header: t('databases.problems'),
                sortValue: (d) => d.problems,
                render: (d) => (d.error ? null : d.problems > 0 ? <Badge variant="warning">{formatNumber(d.problems)}</Badge> : formatNumber(0)),
              },
              {
                key: 'lastRun',
                header: t('databases.lastRun'),
                sortValue: (d) => d.lastRun?.startedAt ?? '',
                render: (d) =>
                  d.lastRun ? (
                    <span className="inline-flex items-center gap-2">
                      <RunStatus run={d.lastRun} />
                      <span className="text-xs text-muted" title={d.lastRun.startedAt}>
                        {formatRelative(d.lastRun.startedAt)}
                        {d.lastRun.actor ? ` · ${d.lastRun.actor}` : ''}
                      </span>
                    </span>
                  ) : (
                    <span className="text-subtle text-xs">{t('databases.never')}</span>
                  ),
              },
            ]}
          />
        )}
      </div>
    </>
  );
}

interface PendingRun {
  direction: 'up' | 'down';
  /** `source:id`, `base`, or none (every pending migration). */
  to?: string;
  sql: string | null;
  sqlError?: string;
}

/** Confirms a run with the SQL it executes (dry run), then runs it. */
function RunDialog({ database, run, problems, onClose, onDone }: {
  database: string;
  run: PendingRun | null;
  problems: boolean;
  onClose: () => void;
  onDone: (result: Run) => void;
}) {
  const api = useApi();
  const { t } = useI18n();
  // A new dialog (key) for each run, so the checkbox starts unchecked
  const [force, setForce] = useState(false);

  const message: ReactNode = run && (
    <div className="space-y-3">
      <div className="text-sm text-muted">{t('databases.sqlPreview')}</div>
      {run.sqlError ? (
        <div className="text-error text-xs">{run.sqlError}</div>
      ) : run.sql === null ? (
        <div className="text-muted text-xs">{t('databases.loading')}</div>
      ) : run.sql === '' ? (
        <div className="text-muted text-xs">{t('databases.noSql')}</div>
      ) : (
        <pre className="max-h-[50vh] overflow-auto rounded-lg border border-border bg-surface p-3 text-[11px] leading-relaxed font-mono text-text whitespace-pre-wrap break-words">{run.sql}</pre>
      )}
      {problems && (
        <label className="flex items-start gap-2 text-xs text-warning">
          <input type="checkbox" className="mt-0.5" checked={force} onChange={(e) => setForce(e.target.checked)} />
          <span>{t('databases.force')}</span>
        </label>
      )}
    </div>
  );

  return (
    <ConfirmDialog
      open={run !== null}
      title={run ? t(run.direction === 'up' ? 'databases.confirmUp' : 'databases.confirmDown', { database }) : ''}
      message={message}
      confirmLabel={run?.direction === 'down' ? t('databases.rollBack') : t('databases.apply')}
      tone={run?.direction === 'down' ? 'danger' : 'default'}
      size="lg"
      onCancel={onClose}
      onConfirm={async () => {
        if (!run) return;
        const result = await api.post<Run>(`${API}/${enc(database)}/migrations/${run.direction}`, { to: run.to, force });
        onDone(result);
      }}
    />
  );
}

function RunDetails({ run, onClose }: { run: Run | null; onClose: () => void }) {
  const { t, formatDate, formatNumber } = useI18n();
  const duration = run ? runDuration(run) : undefined;
  return (
    <Modal
      open={run !== null}
      onClose={onClose}
      size="lg"
      title={run ? t('databases.runTitle', { time: formatDate(run.startedAt, { dateStyle: 'medium', timeStyle: 'medium' }) }) : ''}
      actions={
        <button type="button" className={BUTTON} onClick={onClose}>
          {t('databases.close')}
        </button>
      }
    >
      {run && (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted">{t('databases.status')}</dt>
            <dd><RunStatus run={run} /></dd>
            <dt className="text-muted">{t('databases.direction')}</dt>
            <dd>{run.direction === 'up' ? t('databases.up') : t('databases.down')}</dd>
            {run.target && (
              <>
                <dt className="text-muted">{t('databases.target')}</dt>
                <dd className="font-mono text-xs">{run.target === 'base' ? t('databases.base') : run.target}</dd>
              </>
            )}
            <dt className="text-muted">{t('databases.trigger')}</dt>
            <dd>{triggerLabel(t, run.trigger)}{run.actor ? ` · ${run.actor}` : ''}</dd>
            {duration !== undefined && (
              <>
                <dt className="text-muted">{t('databases.duration')}</dt>
                <dd>{t('databases.ms', { value: formatNumber(duration) })}</dd>
              </>
            )}
          </dl>
          {run.error && <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-xs text-error font-mono whitespace-pre-wrap">{run.error}</div>}
          {run.applied.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {run.applied.map((a) => (
                <li key={`${a.source}:${a.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="font-mono">{a.source}:{a.id} <span className="text-muted">{a.name}</span></span>
                  <span className="text-subtle tabular-nums">{t('databases.ms', { value: formatNumber(a.durationMs) })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

interface Sample {
  time: number;
  stats: DatabaseStats;
}

/** Samples the stats every SAMPLE_SECONDS while mounted; keeps the last MAX_SAMPLES. */
function useStatsSamples(name: string) {
  const api = useApi();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sample = () => {
      api
        .get<DatabaseStats>(`${API}/${enc(name)}/stats`)
        .then(
          (stats) => {
            if (stopped) return;
            setSamples((list) => [...list, { time: Date.parse(stats.collectedAt) || Date.now(), stats }].slice(-MAX_SAMPLES));
            setError(null);
          },
          (e: unknown) => {
            if (!stopped) setError(e instanceof Error ? e.message : String(e));
          },
        )
        .finally(() => {
          if (!stopped) timer = setTimeout(sample, SAMPLE_SECONDS * 1000);
        });
    };
    sample();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [api, name, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { samples, error, reload };
}

function formatUptime(t: T, seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days > 0 ? t('databases.uptimeDays', { days, hours }) : t('databases.uptimeHours', { hours, minutes: Math.floor((seconds % 3600) / 60) });
}

/** A database's stats: size, connections, load over the last minutes, cache hits and the largest tables. */
function DatabaseOverview({ name }: { name: string }) {
  const { t, formatNumber, formatDate } = useI18n();
  const { samples, error, reload } = useStatsSamples(name);
  const latest = samples[samples.length - 1]?.stats;

  if (!latest) {
    return error ? <Failure error={error} onRetry={reload} /> : (
      <div className="space-y-4">
        <SkeletonStatCards count={4} label={t('databases.loading')} />
        <SkeletonChartCard height={160} />
      </div>
    );
  }

  const bytes = (n: number | undefined) => (n === undefined ? undefined : formatBytes(n, formatNumber));
  const perSecond = (key: 'transactions' | 'queries') =>
    samples.slice(1).map((s, i) => rate(samples[i].stats.counters?.[key], s.stats.counters?.[key], (s.time - samples[i].time) / 1000));
  const transactions = perSecond('transactions');
  const queries = perSecond('queries');
  const hasRates = transactions.some((v) => v !== null) || queries.some((v) => v !== null);
  const lastRate = (values: (number | null)[]) => values[values.length - 1];
  const rateText = (value: number | null | undefined) => (value === null || value === undefined ? '–' : formatNumber(value, { maximumFractionDigits: value < 10 ? 1 : 0 }));
  const size = latest.size;
  const sizeParts = [
    size?.dataBytes !== undefined ? `${t('databases.data')} ${bytes(size.dataBytes)}` : '',
    size?.indexBytes !== undefined ? `${t('databases.indexes')} ${bytes(size.indexBytes)}` : '',
    size?.logBytes !== undefined ? `${t('databases.log')} ${bytes(size.logBytes)}` : '',
  ].filter(Boolean).join(' · ');
  const c = latest.connections;
  const scope = latest.countersScope === 'server' ? ` (${t('databases.serverWide')})` : '';
  const series = [
    ...(latest.counters?.transactions !== undefined ? [{ key: 'tx', label: t('databases.transactionsPerSec') + scope, color: 'var(--qcli-primary)', values: transactions }] : []),
    ...(latest.counters?.queries !== undefined ? [{ key: 'q', label: t('databases.queriesPerSec') + scope, color: 'var(--qcli-info)', values: queries }] : []),
  ];

  const server = [
    latest.server?.version,
    latest.server?.uptimeSeconds !== undefined ? `${t('databases.uptime')}: ${formatUptime(t, latest.server.uptimeSeconds)}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-4">
      {error && <Failure error={error} onRetry={reload} />}
      {server && <div className="text-xs text-muted">{server}</div>}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('databases.size')} value={bytes(size?.bytes) ?? '–'} sub={sizeParts || undefined} />
        {c && (
          <StatCard
            label={t('databases.connections')}
            value={formatNumber(c.open ?? c.active ?? 0)}
            sub={[t('databases.connectionsValue', { active: formatNumber(c.active ?? 0), open: formatNumber(c.open ?? 0) }), c.max !== undefined ? t('databases.ofMax', { max: formatNumber(c.max) }) : ''].filter(Boolean).join(' · ')}
          />
        )}
        {series.length > 0 && (
          <StatCard
            label={series.length > 1 ? `${t('databases.transactionsPerSec')} / ${t('databases.queriesPerSec')}` : series[0].label}
            value={series.map((s) => rateText(lastRate(s.values))).join(' / ')}
            sub={latest.countersScope === 'server' ? t('databases.serverWide') : undefined}
          />
        )}
        {latest.cacheHitRatio !== undefined && (
          <StatCard label={t('databases.cacheHit')} value={formatNumber(latest.cacheHitRatio, { style: 'percent', maximumFractionDigits: 1 })} />
        )}
      </div>

      {series.length > 0 && (
        <ChartCard
          title={t('databases.load')}
          note={t('databases.loadNote', { seconds: SAMPLE_SECONDS })}
          legend={<ChartLegend items={series.map((s) => ({ label: s.label, color: s.color, value: rateText(lastRate(s.values)) }))} />}
        >
          {hasRates ? (
            <LineChart
              times={samples.slice(1).map((s) => s.time)}
              series={series}
              formatValue={(v) => rateText(v)}
              formatTime={(time) => formatDate(time, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              formatTick={(time) => formatDate(time, { hour: '2-digit', minute: '2-digit' })}
              height={140}
              ariaLabel={t('databases.load')}
            />
          ) : (
            <div className="text-xs text-subtle py-8 text-center">{t('databases.waitingSample')}</div>
          )}
        </ChartCard>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-heading">{t('databases.largestTables')}</h3>
        {latest.tables && latest.tables.length > 0 ? (
          <DataTable
            data={latest.tables}
            keyExtractor={(r) => `${r.schema ?? ''}.${r.name}`}
            columns={[
              {
                key: 'name',
                header: t('databases.table'),
                sortValue: (r) => r.name,
                render: (r) => <span className="font-mono text-xs">{r.schema ? <span className="text-subtle">{r.schema}.</span> : null}{r.name}</span>,
              },
              { key: 'rows', header: t('databases.rows'), sortValue: (r) => r.rows ?? -1, render: (r) => (r.rows !== undefined ? <span className="tabular-nums">{formatNumber(r.rows)}</span> : null) },
              { key: 'size', header: t('databases.size'), sortValue: (r) => r.bytes ?? -1, render: (r) => (r.bytes !== undefined ? <span className="tabular-nums">{bytes(r.bytes)}</span> : null) },
            ]}
          />
        ) : (
          <div className="text-muted text-sm">{latest.tables ? t('databases.noTables') : '–'}</div>
        )}
      </section>

      {latest.unavailable.length > 0 && (
        <div className="text-xs text-subtle" title={latest.unavailable.map((u) => `${u.metric}: ${u.error}`).join('\n')}>
          {t('databases.unavailableMetrics', { metrics: latest.unavailable.map((u) => u.metric).join(', ') })}
        </div>
      )}
    </div>
  );
}

type Tab = 'overview' | 'migrations' | 'runs';
const TAB_PATHS: Record<Tab, string> = { overview: '', migrations: '/migrations', runs: '/runs' };

/** A database: its overview (stats), its migrations by status with the actions, and the run history. */
function Database({ name, tab }: { name: string; tab: Tab }) {
  const api = useApi();
  const { navigate, hasPermission, notify } = useDashboard();
  const { t, formatNumber, formatDate } = useI18n();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [pending, setPending] = useState<PendingRun | null>(null);
  const [details, setDetails] = useState<Run | null>(null);
  const canRun = hasPermission(RUN_PERMISSION);

  const detail = useLoad<DatabaseDetail>(`${API}/${enc(name)}/migrations`);
  const runs = useLoad<RunsPage>(`${API}/${enc(name)}/migrations/runs?page=${page + 1}&size=${pageSize}`);

  const migrations = detail.value?.migrations ?? [];
  const count = (...statuses: MigrationStatus[]) => migrations.filter((m) => statuses.includes(m.status)).length;
  const problems = count('changed', 'missing') > 0;

  const open = (direction: 'up' | 'down', to?: string) => {
    setPending({ direction, to, sql: null });
    const query = new URLSearchParams({ direction, ...(to ? { to } : {}) });
    api.get<{ sql: string }>(`${API}/${enc(name)}/migrations/sql?${query}`).then(
      (r) => setPending((p) => (p && p.direction === direction && p.to === to ? { ...p, sql: r.sql } : p)),
      (e: unknown) =>
        setPending((p) => (p && p.direction === direction && p.to === to ? { ...p, sql: '', sqlError: e instanceof ApiError ? e.error : String(e) } : p)),
    );
  };

  const done = (run: Run) => {
    setPending(null);
    detail.reload();
    runs.reload();
    if (run.status === 'failed') notify(t('databases.runFailed', { error: run.error ?? '' }), 'error');
    else notify(t(run.direction === 'up' ? 'databases.appliedCount' : 'databases.rolledBackCount', { count: run.applied.length }), 'success');
  };

  /** The migration applied just before `index` (what "roll back to here" keeps), or `base`. */
  const isLastApplied = (index: number) => !migrations.slice(index + 1).some((m) => m.status === 'applied' || m.status === 'changed');

  const tabs = (
    <div role="tablist" aria-label={name} className="flex items-center gap-1 border-b border-border/75">
      {(['overview', 'migrations', 'runs'] as const).map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={tab === key}
          onClick={() => navigate(`/db/${enc(name)}${TAB_PATHS[key]}`)}
          className={`-mb-px px-3 py-2 text-sm border-b-2 transition-colors ${
            tab === key ? 'border-primary text-heading font-medium' : 'border-transparent text-muted hover:text-text'
          }`}
        >
          {key === 'overview' ? t('databases.tabOverview') : key === 'migrations' ? t('databases.tabMigrations') : t('databases.tabRuns')}{' '}
          {key !== 'overview' && (
            <span className="text-xs tabular-nums text-subtle">
              {key === 'migrations' ? formatNumber(migrations.length) : runs.value ? formatNumber(runs.value.total) : ''}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader
        title={`${t('databases.database')}: ${name}`}
        subtitle={
          detail.value
            ? [detail.value.dialect, detail.value.sources.length ? t('databases.sources', { sources: detail.value.sources.join(', ') }) : ''].filter(Boolean).join(' · ')
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <button type="button" className={BUTTON} onClick={() => navigate('/')}>
              ← {t('databases.back')}
            </button>
            {canRun && migrations.length > 0 && (
              <button type="button" className={PRIMARY_BUTTON} disabled={count('pending', 'failed') === 0} onClick={() => open('up')}>
                {t('databases.applyPending')}
              </button>
            )}
          </div>
        }
      />
      <div className="p-4 sm:p-6 space-y-4">
        {detail.error && <Failure error={detail.error} onRetry={detail.reload} />}
        {tab !== 'overview' && detail.value && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <StatCard label={t('databases.applied')} value={formatNumber(count('applied', 'changed'))} />
            <StatCard label={t('databases.pending')} value={formatNumber(count('pending', 'failed'))} />
            <StatCard label={t('databases.problems')} value={formatNumber(count('changed', 'missing', 'failed'))} />
          </div>
        )}
        {problems && <div role="status" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">{t('databases.problemsHint')}</div>}
        {tab !== 'overview' && !canRun && detail.value && <div className="text-xs text-subtle">{t('databases.readOnly')}</div>}
        {tabs}

        {tab === 'overview' && <DatabaseOverview name={name} />}

        {tab === 'migrations' && !detail.value && !detail.error && <SkeletonTable rows={6} columns={6} label={t('databases.loading')} />}
        {tab === 'migrations' && detail.value && (
          migrations.length === 0 ? (
            <EmptyState className="bg-surface border border-border rounded-xl" message={t('databases.noMigrations')} />
          ) : (
            <DataTable
              data={migrations}
              keyExtractor={(m) => qualified(m)}
              columns={[
                {
                  key: 'migration',
                  header: t('databases.migration'),
                  render: (m: MigrationState) => (
                    <span className="flex flex-col">
                      <span className="font-mono text-xs text-heading">{m.source}:{m.id}</span>
                      <span className="text-xs text-muted">{m.name}</span>
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: t('databases.status'),
                  render: (m) => <Badge variant={STATUS_BADGE[m.status]} dot>{statusLabel(t, m.status)}</Badge>,
                },
                {
                  key: 'appliedAt',
                  header: t('databases.appliedAt'),
                  render: (m) => (m.appliedAt ? <span className="text-xs" title={m.appliedAt}>{formatDate(m.appliedAt, { dateStyle: 'medium', timeStyle: 'short' })}</span> : null),
                },
                { key: 'by', header: t('databases.by'), render: (m) => <span className="text-xs">{m.appliedBy ?? ''}</span> },
                {
                  key: 'duration',
                  header: t('databases.duration'),
                  render: (m) => (m.durationMs !== undefined ? <span className="text-xs tabular-nums">{t('databases.ms', { value: formatNumber(m.durationMs) })}</span> : null),
                },
                ...(canRun
                  ? [
                      {
                        key: 'actions',
                        header: '',
                        render: (m: MigrationState) => {
                          const index = migrations.indexOf(m);
                          if (m.status === 'pending' || m.status === 'failed') {
                            return (
                              <button type="button" className={LINK_BUTTON} onClick={() => open('up', qualified(m))}>
                                {t('databases.migrateTo')}
                              </button>
                            );
                          }
                          if ((m.status === 'applied' || m.status === 'changed') && !isLastApplied(index)) {
                            return (
                              <button type="button" className={LINK_BUTTON} onClick={() => open('down', qualified(m))}>
                                {t('databases.rollBackTo')}
                              </button>
                            );
                          }
                          return null;
                        },
                      },
                    ]
                  : []),
              ]}
            />
          )
        )}
        {tab === 'migrations' && canRun && count('applied', 'changed') > 0 && (
          <div className="flex justify-end">
            <button type="button" className={LINK_BUTTON} onClick={() => open('down', 'base')}>
              {t('databases.rollBackAll')}
            </button>
          </div>
        )}

        {tab === 'runs' && runs.error && <Failure error={runs.error} onRetry={runs.reload} />}
        {tab === 'runs' && !runs.value && !runs.error && <SkeletonTable rows={6} columns={7} label={t('databases.loading')} />}
        {tab === 'runs' && runs.value && (
          runs.value.total === 0 ? (
            <EmptyState className="bg-surface border border-border rounded-xl" message={t('databases.noRuns')} />
          ) : (
            <div className={runs.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={runs.loading}>
              <DataTable
                data={runs.value.items}
                keyExtractor={(r) => r.id}
                onRowClick={setDetails}
                columns={[
                  {
                    key: 'started',
                    header: t('databases.started'),
                    render: (r) => <span className="text-xs" title={r.startedAt}>{formatDate(r.startedAt, { dateStyle: 'medium', timeStyle: 'medium' })}</span>,
                  },
                  { key: 'direction', header: t('databases.direction'), render: (r) => (r.direction === 'up' ? t('databases.up') : t('databases.down')) },
                  { key: 'status', header: t('databases.status'), render: (r) => <RunStatus run={r} /> },
                  { key: 'count', header: t('databases.count'), render: (r) => <span className="tabular-nums">{formatNumber(r.applied.length)}</span> },
                  { key: 'trigger', header: t('databases.trigger'), render: (r) => <span className="text-xs">{triggerLabel(t, r.trigger)}</span> },
                  { key: 'by', header: t('databases.by'), render: (r) => <span className="text-xs">{r.actor ?? ''}</span> },
                  {
                    key: 'duration',
                    header: t('databases.duration'),
                    render: (r) => {
                      const ms = runDuration(r);
                      return ms === undefined ? null : <span className="text-xs tabular-nums">{t('databases.ms', { value: formatNumber(ms) })}</span>;
                    },
                  },
                ]}
              />
              <Pagination
                page={page}
                pageSize={pageSize}
                total={runs.value.total}
                onPage={setPage}
                onPageSize={(size) => {
                  setPageSize(size);
                  setPage(0);
                }}
              />
            </div>
          )
        )}
      </div>
      <RunDialog
        key={pending ? `${pending.direction}:${pending.to ?? ''}` : 'closed'}
        database={name}
        run={pending}
        problems={problems}
        onClose={() => setPending(null)}
        onDone={done}
      />
      <RunDetails run={details} onClose={() => setDetails(null)} />
    </>
  );
}

/**
 * Routes inside the extension: `/` the databases, `/db/<name>` one database's overview, `/db/<name>/migrations` its
 * migrations, `/db/<name>/runs` its runs.
 */
function DatabasesPage() {
  const { path } = useDashboard();
  const match = /^\/db\/([^/?#]+)(?:\/(migrations|runs))?/.exec(path);
  if (match) return <Database key={match[1]} name={decodeURIComponent(match[1])} tab={(match[2] as Tab | undefined) ?? 'overview'} />;
  return <DatabaseList />;
}

/** The Overview's card: how many databases, and what waits (pending migrations, problems). */
function DatabasesCard() {
  const { t, formatNumber } = useI18n();
  const { value } = useLoad<{ databases: DatabaseSummary[] }>(API);
  const list = value?.databases ?? null;
  const pending = list?.reduce((n, d) => n + d.pending, 0) ?? 0;
  const problems = list?.reduce((n, d) => n + d.problems + (d.error ? 1 : 0), 0) ?? 0;
  return (
    <StatCard
      label={t('databases.title')}
      value={list ? formatNumber(list.length) : '—'}
      sub={list ? t('databases.cardSub', { pending: formatNumber(pending), problems: formatNumber(problems) }) : undefined}
    />
  );
}

export default defineExtension(DatabasesPage, {
  overview: {
    cards: [{ id: 'databases', size: 'stat', component: DatabasesCard }],
    /** A database that cannot be read or has problems (error), or migrations waiting (warning). */
    attention: async (context) => {
      const { databases } = await createApi(context.fetch).get<{ databases: DatabaseSummary[] }>(API);
      const t = createTranslations(messages, context.language).t;
      return databases.flatMap((d): AttentionItem[] => {
        const path = `/db/${enc(d.name)}`;
        if (d.error) return [{ id: d.name, level: 'error', title: d.name, detail: t('databases.unavailable', { error: d.error }), path }];
        if (d.problems > 0) return [{ id: d.name, level: 'error', title: d.name, detail: t('databases.attentionProblems', { count: d.problems }), path: `${path}/migrations` }];
        if (d.pending > 0) return [{ id: d.name, level: 'warning', title: d.name, detail: t('databases.attentionPending', { count: d.pending }), path: `${path}/migrations` }];
        return [];
      });
    },
  },
});
