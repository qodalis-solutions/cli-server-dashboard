import { useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useApi } from '../../hooks/useApi';
import {
  executeDataExplorerQuery, getDataExplorerSchema, getDataExplorerSources,
  type DataExplorerSchema, type DataExplorerSource, type QueryOutcome,
} from '../../api/dataExplorer';
import { useI18n } from '../../i18n';
import { tableQuery, toResultTable } from './resultTable';

const BUTTON = 'px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors disabled:opacity-40';
const PRIMARY_BUTTON = 'px-4 py-1.5 text-xs font-medium bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors disabled:opacity-40';

type SchemaState = { status: 'loading' } | { status: 'loaded'; schema: DataExplorerSchema | null } | { status: 'error'; message: string };

function SourceBadges({ source }: { source: DataExplorerSource }) {
  const { t } = useI18n();
  return (
    <span className="flex flex-wrap gap-1">
      <Badge variant="neutral">{source.language}</Badge>
      {source.readOnly === true && <Badge variant="info">{t('dataExplorer.readOnly')}</Badge>}
      {source.readOnly === false && <Badge variant="warning">{t('dataExplorer.writable')}</Badge>}
      {source.canExport === true && <Badge variant="success">{t('dataExplorer.canExport')}</Badge>}
    </span>
  );
}

function SchemaPanel({ state, language, onPick }: { state: SchemaState; language: string; onPick: (query: string) => void }) {
  const { t } = useI18n();
  if (state.status === 'loading') return <div className="text-xs text-muted">{t('dataExplorer.schemaLoading')}</div>;
  if (state.status === 'error') return <div className="text-xs text-error">{t('dataExplorer.schemaError', { message: state.message })}</div>;
  if (!state.schema) return <div className="text-xs text-subtle">{t('dataExplorer.schemaUnsupported')}</div>;
  if (state.schema.tables.length === 0) return <div className="text-xs text-subtle">{t('dataExplorer.schemaEmpty')}</div>;
  return (
    <ul className="space-y-1 max-h-80 overflow-y-auto pr-1">
      {state.schema.tables.map(table => {
        const query = tableQuery(language, table.name);
        return (
          <li key={table.name}>
            <details className="group">
              <summary className="cursor-pointer text-xs flex items-center gap-1.5 text-text hover:text-accent">
                <span className="font-mono truncate">{table.name}</span>
                <span className="text-subtle">{table.type}</span>
              </summary>
              <ul className="ml-3 mt-1 mb-2 space-y-0.5">
                {table.columns.map(col => (
                  <li key={col.name} className="text-[11px] font-mono flex gap-2">
                    <span className={col.primaryKey ? 'text-accent' : 'text-text'} title={col.primaryKey ? t('dataExplorer.primaryKey') : undefined}>
                      {col.primaryKey ? '🔑 ' : ''}{col.name}
                    </span>
                    <span className="text-subtle">{col.type}{col.nullable ? '?' : ''}</span>
                  </li>
                ))}
                {query && (
                  <li>
                    <button type="button" onClick={() => onPick(query)} className="text-[11px] text-accent hover:underline">
                      {t('dataExplorer.useTable')}
                    </button>
                  </li>
                )}
              </ul>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

function ResultView({ outcome }: { outcome: QueryOutcome }) {
  const { t, formatNumber } = useI18n();

  if (outcome.kind === 'refused') {
    return (
      <div role="alert" className="p-4 rounded-xl border border-warning/40 bg-warning/10">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Badge variant="warning">{outcome.code}</Badge>
          <span className="text-sm font-medium text-heading">{t(`dataExplorer.refused_${outcome.code}`)}</span>
        </div>
        <div className="text-xs text-muted">{t(`dataExplorer.refusedHint_${outcome.code}`)}</div>
        {outcome.message && <div className="mt-2 text-xs font-mono text-text break-words">{outcome.message}</div>}
      </div>
    );
  }
  if (outcome.kind === 'failed') {
    return (
      <div role="alert" className="p-4 rounded-xl border border-error/40 bg-error/10">
        <div className="text-sm font-medium text-error mb-1">{t('dataExplorer.failed')}</div>
        <div className="text-xs font-mono text-text break-words whitespace-pre-wrap">{outcome.message || '—'}</div>
      </div>
    );
  }

  const { result } = outcome;
  const table = toResultTable(result);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted" role="status">
        <span>{t('dataExplorer.rows', { count: result.rowCount ?? table.rows.length })}</span>
        <span aria-hidden>·</span>
        <span>{t('dataExplorer.time', { ms: formatNumber(result.executionTime ?? 0) })}</span>
        {result.truncated && <Badge variant="warning">{t('dataExplorer.truncated')}</Badge>}
      </div>
      {table.columns.length === 0 || table.rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-subtle bg-surface border border-border rounded-xl">{t('dataExplorer.noRows')}</div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-auto max-h-[60vh]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border/75">
                {table.columns.map(col => (
                  <th key={col} className="px-3 py-2 text-left font-mono font-medium text-subtle whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-control/40">
                  {row.map((cell, j) => (
                    <td key={j} className={`px-3 py-1.5 font-mono whitespace-nowrap max-w-[24rem] truncate ${cell === 'NULL' ? 'text-subtle italic' : 'text-text'}`} title={cell}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Queries the server's data sources: pick a source, write or pick a query, run it and read the rows. */
export default function DataExplorerPage() {
  const { t } = useI18n();
  const { data: sources, loading, error, refetch } = useApi(getDataExplorerSources, []);
  const [params, setParams] = useSearchParams();
  // Each source keeps its own query, result and schema while the page is open
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Record<string, QueryOutcome>>({});
  const [schemas, setSchemas] = useState<Record<string, SchemaState>>({});
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);

  const list = Array.isArray(sources) ? sources : [];
  const selected = list.find(s => s.name === params.get('source')) ?? list[0] ?? null;
  const query = selected ? queries[selected.name] ?? '' : '';
  const outcome = selected ? outcomes[selected.name] : undefined;
  const schema = selected ? schemas[selected.name] : undefined;

  const select = (name: string) => setParams(prev => {
    const next = new URLSearchParams(prev);
    next.set('source', name);
    return next;
  }, { replace: true });

  const setQuery = (value: string) => {
    if (selected) setQueries(prev => ({ ...prev, [selected.name]: value }));
  };

  async function loadSchema(source: string) {
    setSchemas(prev => ({ ...prev, [source]: { status: 'loading' } }));
    try {
      const loaded = await getDataExplorerSchema(source);
      setSchemas(prev => ({ ...prev, [source]: { status: 'loaded', schema: loaded } }));
    } catch (err) {
      setSchemas(prev => ({ ...prev, [source]: { status: 'error', message: err instanceof Error ? err.message : String(err) } }));
    }
  }

  function toggleSchema() {
    const open = !schemaOpen;
    setSchemaOpen(open);
    if (open && selected && (!schema || schema.status === 'error')) void loadSchema(selected.name);
  }

  function pickSource(source: DataExplorerSource) {
    select(source.name);
    const known = schemas[source.name];
    if (schemaOpen && (!known || known.status === 'error')) void loadSchema(source.name);
  }

  async function run() {
    if (!selected || !query.trim() || running) return;
    const source = selected.name;
    setRunning(source);
    try {
      const result = await executeDataExplorerQuery(source, query);
      setOutcomes(prev => ({ ...prev, [source]: result }));
    } finally {
      setRunning(null);
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void run();
    }
  };

  return (
    <div>
      <PageHeader
        title={t('nav.dataExplorer')}
        subtitle={sources ? t('dataExplorer.subtitle', { count: list.length }) : t('common.loading')}
        actions={<button onClick={refetch} className={BUTTON}>{t('common.refresh')}</button>}
      />
      <div className="p-4 sm:p-6 space-y-4">
        {loading && !sources && <div className="text-muted text-sm">{t('dataExplorer.loading')}</div>}
        {error && <div className="text-error text-sm">{t('dataExplorer.error', { message: error })}</div>}
        {sources && list.length === 0 && (
          <div role="status" className="max-w-lg p-4 rounded-lg bg-surface border border-border text-sm text-muted">{t('dataExplorer.noSources')}</div>
        )}

        {selected && (
          <div className="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-4">
            <nav aria-label={t('dataExplorer.sources')} className="space-y-2">
              <h3 className="text-[10px] text-subtle uppercase tracking-wider font-medium">{t('dataExplorer.sources')}</h3>
              <ul className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1">
                {list.map(source => {
                  const active = source.name === selected.name;
                  return (
                    <li key={source.name} className="min-w-[13rem] lg:min-w-0">
                      <button
                        type="button"
                        onClick={() => pickSource(source)}
                        aria-current={active ? 'true' : undefined}
                        className={`w-full text-left p-3 rounded-xl border transition-colors ${active ? 'bg-control border-primary/50' : 'bg-surface border-border hover:bg-control/60'}`}
                      >
                        <div className="font-mono text-sm text-accent truncate">{source.name}</div>
                        {source.description && <div className="text-xs text-muted mt-0.5 line-clamp-2">{source.description}</div>}
                        <div className="mt-2"><SourceBadges source={source} /></div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <section className="space-y-3 min-w-0" aria-label={selected.name}>
              <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-heading font-mono mr-auto">{selected.name}</h3>
                  {selected.templates && selected.templates.length > 0 && (
                    <select
                      aria-label={t('dataExplorer.templates')}
                      value=""
                      onChange={e => {
                        const template = selected.templates?.find(tp => tp.name === e.target.value);
                        if (template) setQuery(template.query);
                      }}
                      className="px-2.5 py-1.5 text-xs bg-control border border-border rounded-lg text-text max-w-[14rem]"
                    >
                      <option value="">{t('dataExplorer.pickTemplate')}</option>
                      {selected.templates.map(tp => (
                        <option key={tp.name} value={tp.name} title={tp.description}>{tp.name}</option>
                      ))}
                    </select>
                  )}
                  <button type="button" onClick={toggleSchema} aria-expanded={schemaOpen} className={BUTTON}>
                    {t('dataExplorer.schema')}
                  </button>
                </div>
                {selected.readOnly === true && <p className="text-xs text-subtle">{t('dataExplorer.readOnlyHint')}</p>}
                <div className={schemaOpen ? 'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_14rem] gap-3' : ''}>
                  <textarea
                    aria-label={t('dataExplorer.query')}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={t('dataExplorer.queryPlaceholder', { language: selected.language })}
                    spellCheck={false}
                    rows={6}
                    className="w-full px-3 py-2 font-mono text-xs bg-control border border-border rounded-lg text-text placeholder:text-subtle focus:outline-none focus:border-primary/50 resize-y"
                  />
                  {schemaOpen && (
                    <div className="bg-control/40 border border-border/75 rounded-lg p-3">
                      <div className="text-[10px] text-subtle uppercase tracking-wider font-medium mb-2">{t('dataExplorer.schema')}</div>
                      <SchemaPanel state={schema ?? { status: 'loading' }} language={selected.language} onPick={setQuery} />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => void run()} disabled={!query.trim() || running !== null} className={PRIMARY_BUTTON}>
                    {running === selected.name ? t('dataExplorer.running') : t('dataExplorer.run')}
                  </button>
                  <span className="text-xs text-subtle">{t('dataExplorer.runHint')}</span>
                </div>
              </div>

              {outcome && (
                <ErrorBoundary label={t('dataExplorer.result')} resetKeys={[outcome]}>
                  <ResultView outcome={outcome} />
                </ErrorBoundary>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
