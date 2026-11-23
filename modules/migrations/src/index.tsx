import './styles.css';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ApiError,
  Badge,
  ConfirmDialog,
  DataTable,
  Modal,
  PageHeader,
  Pagination,
  StatCard,
  defineExtension,
  useApi,
  useDashboard,
  useServerEvents,
  useTranslations,
} from '@qodalis/cli-server-dashboard-kit';
import { messages } from './messages';
import {
  API,
  enc,
  qualified,
  runDuration,
  type DatabaseDetail,
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
const RUN_PERMISSION = 'migrations:run';

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
  return t(`migrations.${keys[status]}`);
}

function RunStatus({ run }: { run: Pick<RunSummary, 'status'> }) {
  const { t } = useI18n();
  if (run.status === 'running') return <Badge variant="info" dot>{t('migrations.runRunning')}</Badge>;
  if (run.status === 'failed') return <Badge variant="error" dot>{t('migrations.runFailedStatus')}</Badge>;
  return <Badge variant="success" dot>{t('migrations.runSucceeded')}</Badge>;
}

function triggerLabel(t: T, trigger: string): string {
  const keys: Record<string, 'triggerStartup' | 'triggerApi' | 'triggerTerminal' | 'triggerMcp'> = {
    startup: 'triggerStartup',
    api: 'triggerApi',
    terminal: 'triggerTerminal',
    mcp: 'triggerMcp',
  };
  return keys[trigger] ? t(`migrations.${keys[trigger]}`) : trigger;
}

/** Loads `url` now, when it changes, and after `migrations:run` events. */
function useLoad<V>(url: string) {
  const api = useApi();
  const [value, setValue] = useState<V | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    api.get<V>(url).then(
      (v) => {
        setValue(v);
        setError(null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [api, url]);
  useEffect(reload, [reload]);
  useServerEvents('migrations:run', reload);
  return { value, error, reload };
}

function Failure({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="bg-error/10 border border-error/30 text-error text-sm rounded-lg p-3 flex items-center justify-between gap-3">
      <span>{error}</span>
      <button type="button" className={BUTTON} onClick={onRetry}>
        {t('migrations.retry')}
      </button>
    </div>
  );
}

/** The databases with their counts and last run. */
function Overview() {
  const { navigate } = useDashboard();
  const { t, formatNumber, formatRelative } = useI18n();
  const { value: overview, error, reload } = useLoad<{ databases: DatabaseSummary[] }>(API);
  const value = overview?.databases ?? null;

  return (
    <>
      <PageHeader title={t('migrations.title')} subtitle={t('migrations.subtitle')} />
      <div className="p-4 sm:p-6 space-y-4">
        {error && <Failure error={error} onRetry={reload} />}
        {!value && !error && <div className="text-muted text-sm">{t('migrations.loading')}</div>}
        {value && value.length === 0 && <div className="text-muted text-sm">{t('migrations.noDatabases')}</div>}
        {value && value.length > 0 && (
          <DataTable
            data={value}
            keyExtractor={(d) => d.name}
            onRowClick={(d) => navigate(`/db/${enc(d.name)}`)}
            columns={[
              {
                key: 'name',
                header: t('migrations.database'),
                sortValue: (d) => d.name,
                render: (d) => <span className="font-mono text-primary">{d.name}</span>,
              },
              { key: 'dialect', header: t('migrations.dialect'), render: (d) => <Badge variant="neutral">{d.dialect}</Badge> },
              {
                key: 'applied',
                header: t('migrations.applied'),
                sortValue: (d) => d.applied,
                render: (d) => (d.error ? <span className="text-error text-xs">{t('migrations.unavailable', { error: d.error })}</span> : formatNumber(d.applied)),
              },
              {
                key: 'pending',
                header: t('migrations.pending'),
                sortValue: (d) => d.pending,
                render: (d) => (d.error ? null : d.pending > 0 ? <Badge variant="info">{formatNumber(d.pending)}</Badge> : formatNumber(0)),
              },
              {
                key: 'problems',
                header: t('migrations.problems'),
                sortValue: (d) => d.problems,
                render: (d) => (d.error ? null : d.problems > 0 ? <Badge variant="warning">{formatNumber(d.problems)}</Badge> : formatNumber(0)),
              },
              {
                key: 'lastRun',
                header: t('migrations.lastRun'),
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
                    <span className="text-subtle text-xs">{t('migrations.never')}</span>
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
      <div className="text-sm text-muted">{t('migrations.sqlPreview')}</div>
      {run.sqlError ? (
        <div className="text-error text-xs">{run.sqlError}</div>
      ) : run.sql === null ? (
        <div className="text-muted text-xs">{t('migrations.loading')}</div>
      ) : run.sql === '' ? (
        <div className="text-muted text-xs">{t('migrations.noSql')}</div>
      ) : (
        <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-surface p-3 text-[11px] leading-relaxed font-mono text-text whitespace-pre">{run.sql}</pre>
      )}
      {problems && (
        <label className="flex items-start gap-2 text-xs text-warning">
          <input type="checkbox" className="mt-0.5" checked={force} onChange={(e) => setForce(e.target.checked)} />
          <span>{t('migrations.force')}</span>
        </label>
      )}
    </div>
  );

  return (
    <ConfirmDialog
      open={run !== null}
      title={run ? t(run.direction === 'up' ? 'migrations.confirmUp' : 'migrations.confirmDown', { database }) : ''}
      message={message}
      confirmLabel={run?.direction === 'down' ? t('migrations.rollBack') : t('migrations.apply')}
      tone={run?.direction === 'down' ? 'danger' : 'default'}
      onCancel={onClose}
      onConfirm={async () => {
        if (!run) return;
        const result = await api.post<Run>(`${API}/${enc(database)}/${run.direction}`, { to: run.to, force });
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
      title={run ? t('migrations.runTitle', { time: formatDate(run.startedAt, { dateStyle: 'medium', timeStyle: 'medium' }) }) : ''}
      actions={
        <button type="button" className={BUTTON} onClick={onClose}>
          {t('migrations.close')}
        </button>
      }
    >
      {run && (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted">{t('migrations.status')}</dt>
            <dd><RunStatus run={run} /></dd>
            <dt className="text-muted">{t('migrations.direction')}</dt>
            <dd>{run.direction === 'up' ? t('migrations.up') : t('migrations.down')}</dd>
            {run.target && (
              <>
                <dt className="text-muted">{t('migrations.target')}</dt>
                <dd className="font-mono text-xs">{run.target === 'base' ? t('migrations.base') : run.target}</dd>
              </>
            )}
            <dt className="text-muted">{t('migrations.trigger')}</dt>
            <dd>{triggerLabel(t, run.trigger)}{run.actor ? ` · ${run.actor}` : ''}</dd>
            {duration !== undefined && (
              <>
                <dt className="text-muted">{t('migrations.duration')}</dt>
                <dd>{t('migrations.ms', { value: formatNumber(duration) })}</dd>
              </>
            )}
          </dl>
          {run.error && <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-xs text-error font-mono whitespace-pre-wrap">{run.error}</div>}
          {run.applied.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {run.applied.map((a) => (
                <li key={`${a.source}:${a.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <span className="font-mono">{a.source}:{a.id} <span className="text-muted">{a.name}</span></span>
                  <span className="text-subtle tabular-nums">{t('migrations.ms', { value: formatNumber(a.durationMs) })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

/** A database: its migrations by status, the actions, and the run history. */
function Database({ name, tab }: { name: string; tab: 'migrations' | 'runs' }) {
  const api = useApi();
  const { navigate, hasPermission, notify } = useDashboard();
  const { t, formatNumber, formatDate } = useI18n();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [pending, setPending] = useState<PendingRun | null>(null);
  const [details, setDetails] = useState<Run | null>(null);
  const canRun = hasPermission(RUN_PERMISSION);

  const detail = useLoad<DatabaseDetail>(`${API}/${enc(name)}`);
  const runs = useLoad<RunsPage>(`${API}/${enc(name)}/runs?page=${page + 1}&size=${pageSize}`);

  const migrations = detail.value?.migrations ?? [];
  const count = (...statuses: MigrationStatus[]) => migrations.filter((m) => statuses.includes(m.status)).length;
  const problems = count('changed', 'missing') > 0;

  const open = (direction: 'up' | 'down', to?: string) => {
    setPending({ direction, to, sql: null });
    const query = new URLSearchParams({ direction, ...(to ? { to } : {}) });
    api.get<{ sql: string }>(`${API}/${enc(name)}/sql?${query}`).then(
      (r) => setPending((p) => (p && p.direction === direction && p.to === to ? { ...p, sql: r.sql } : p)),
      (e: unknown) =>
        setPending((p) => (p && p.direction === direction && p.to === to ? { ...p, sql: '', sqlError: e instanceof ApiError ? e.error : String(e) } : p)),
    );
  };

  const done = (run: Run) => {
    setPending(null);
    detail.reload();
    runs.reload();
    if (run.status === 'failed') notify(t('migrations.runFailed', { error: run.error ?? '' }), 'error');
    else notify(t(run.direction === 'up' ? 'migrations.appliedCount' : 'migrations.rolledBackCount', { count: run.applied.length }), 'success');
  };

  /** The migration applied just before `index` (what "roll back to here" keeps), or `base`. */
  const isLastApplied = (index: number) => !migrations.slice(index + 1).some((m) => m.status === 'applied' || m.status === 'changed');

  const tabs = (
    <div role="tablist" aria-label={name} className="flex items-center gap-1 border-b border-border/75">
      {(['migrations', 'runs'] as const).map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={tab === key}
          onClick={() => navigate(key === 'runs' ? `/db/${enc(name)}/runs` : `/db/${enc(name)}`)}
          className={`-mb-px px-3 py-2 text-sm border-b-2 transition-colors ${
            tab === key ? 'border-primary text-heading font-medium' : 'border-transparent text-muted hover:text-text'
          }`}
        >
          {key === 'migrations' ? t('migrations.tabMigrations') : t('migrations.tabRuns')}{' '}
          <span className="text-xs tabular-nums text-subtle">
            {key === 'migrations' ? formatNumber(migrations.length) : runs.value ? formatNumber(runs.value.total) : ''}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader
        title={`${t('migrations.database')}: ${name}`}
        subtitle={detail.value ? `${detail.value.dialect} · ${t('migrations.sources', { sources: detail.value.sources.join(', ') })}` : undefined}
        actions={
          <div className="flex items-center gap-2">
            <button type="button" className={BUTTON} onClick={() => navigate('/')}>
              ← {t('migrations.back')}
            </button>
            {canRun && (
              <button type="button" className={PRIMARY_BUTTON} disabled={count('pending', 'failed') === 0} onClick={() => open('up')}>
                {t('migrations.applyPending')}
              </button>
            )}
          </div>
        }
      />
      <div className="p-4 sm:p-6 space-y-4">
        {detail.error && <Failure error={detail.error} onRetry={detail.reload} />}
        {detail.value && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <StatCard label={t('migrations.applied')} value={formatNumber(count('applied', 'changed'))} />
            <StatCard label={t('migrations.pending')} value={formatNumber(count('pending', 'failed'))} />
            <StatCard label={t('migrations.problems')} value={formatNumber(count('changed', 'missing', 'failed'))} />
          </div>
        )}
        {problems && <div role="status" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">{t('migrations.problemsHint')}</div>}
        {!canRun && detail.value && <div className="text-xs text-subtle">{t('migrations.readOnly')}</div>}
        {tabs}

        {tab === 'migrations' && detail.value && (
          migrations.length === 0 ? (
            <div className="text-muted text-sm">{t('migrations.noMigrations')}</div>
          ) : (
            <DataTable
              data={migrations}
              keyExtractor={(m) => qualified(m)}
              columns={[
                {
                  key: 'migration',
                  header: t('migrations.migration'),
                  render: (m: MigrationState) => (
                    <span className="flex flex-col">
                      <span className="font-mono text-xs text-heading">{m.source}:{m.id}</span>
                      <span className="text-xs text-muted">{m.name}</span>
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: t('migrations.status'),
                  render: (m) => <Badge variant={STATUS_BADGE[m.status]} dot>{statusLabel(t, m.status)}</Badge>,
                },
                {
                  key: 'appliedAt',
                  header: t('migrations.appliedAt'),
                  render: (m) => (m.appliedAt ? <span className="text-xs" title={m.appliedAt}>{formatDate(m.appliedAt, { dateStyle: 'medium', timeStyle: 'short' })}</span> : null),
                },
                { key: 'by', header: t('migrations.by'), render: (m) => <span className="text-xs">{m.appliedBy ?? ''}</span> },
                {
                  key: 'duration',
                  header: t('migrations.duration'),
                  render: (m) => (m.durationMs !== undefined ? <span className="text-xs tabular-nums">{t('migrations.ms', { value: formatNumber(m.durationMs) })}</span> : null),
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
                                {t('migrations.migrateTo')}
                              </button>
                            );
                          }
                          if ((m.status === 'applied' || m.status === 'changed') && !isLastApplied(index)) {
                            return (
                              <button type="button" className={LINK_BUTTON} onClick={() => open('down', qualified(m))}>
                                {t('migrations.rollBackTo')}
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
              {t('migrations.rollBackAll')}
            </button>
          </div>
        )}

        {tab === 'runs' && runs.error && <Failure error={runs.error} onRetry={runs.reload} />}
        {tab === 'runs' && runs.value && (
          runs.value.total === 0 ? (
            <div className="text-muted text-sm">{t('migrations.noRuns')}</div>
          ) : (
            <>
              <DataTable
                data={runs.value.items}
                keyExtractor={(r) => r.id}
                onRowClick={setDetails}
                columns={[
                  {
                    key: 'started',
                    header: t('migrations.started'),
                    render: (r) => <span className="text-xs" title={r.startedAt}>{formatDate(r.startedAt, { dateStyle: 'medium', timeStyle: 'medium' })}</span>,
                  },
                  { key: 'direction', header: t('migrations.direction'), render: (r) => (r.direction === 'up' ? t('migrations.up') : t('migrations.down')) },
                  { key: 'status', header: t('migrations.status'), render: (r) => <RunStatus run={r} /> },
                  { key: 'count', header: t('migrations.count'), render: (r) => <span className="tabular-nums">{formatNumber(r.applied.length)}</span> },
                  { key: 'trigger', header: t('migrations.trigger'), render: (r) => <span className="text-xs">{triggerLabel(t, r.trigger)}</span> },
                  { key: 'by', header: t('migrations.by'), render: (r) => <span className="text-xs">{r.actor ?? ''}</span> },
                  {
                    key: 'duration',
                    header: t('migrations.duration'),
                    render: (r) => {
                      const ms = runDuration(r);
                      return ms === undefined ? null : <span className="text-xs tabular-nums">{t('migrations.ms', { value: formatNumber(ms) })}</span>;
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
            </>
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

/** Routes inside the extension: `/` the databases, `/db/<name>` one database, `/db/<name>/runs` its runs. */
function MigrationsPage() {
  const { path } = useDashboard();
  const match = /^\/db\/([^/?#]+)(\/runs)?/.exec(path);
  if (match) return <Database key={match[1]} name={decodeURIComponent(match[1])} tab={match[2] ? 'runs' : 'migrations'} />;
  return <Overview />;
}

export default defineExtension(MigrationsPage);
