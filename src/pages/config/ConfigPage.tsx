import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { EmptyState, ErrorState, SkeletonGroup, Skeleton, SkeletonText } from '@qodalis/cli-server-dashboard-kit';
import PageHeader from '../../components/PageHeader';
import ConfirmDialog from '../../components/ConfirmDialog';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useApi } from '../../hooks/useApi';
import { useI18n } from '../../i18n';
import { useOptionalWebSocket } from '../../context/WebSocketContext';
import { getConfigOverview, updateConfigSection, ConfigConflictError, ConfigValidationError } from '../../api/config';
import type { ConfigChangedEvent, ConfigEntry, ConfigProvider, ConfigValue } from '../../types';
import ConfigSectionCard from './ConfigSectionCard';
import { ConfigStoreBanner, ProviderStorage, ProviderStore, ProviderStoreBadge } from './ConfigStorage';
import { distinctStores, effectiveStore } from './configStore';
import { useConfigEditors } from './configEditors';
import { displayValue, editChange, entryMatches, isChange, toDraft, type Edit } from './configValue';

/** A section's place: `provider/section`. */
const sectionKey = (provider: string, section: string) => `${provider}/${section}`;

type ByKey<T> = Record<string, Record<string, T>>;

/** One change in the confirmation's diff. */
interface DiffRow {
  key: string;
  label: string;
  before: string;
  after: string;
  requiresRestart: boolean;
}

/** The changes of one section, ready to send. */
interface PendingSection {
  provider: ConfigProvider;
  sectionId: string;
  title: string;
  version: string | null;
  changes: Record<string, ConfigValue>;
  rows: DiffRow[];
}

function ConfigSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="p-4 sm:p-6 grid gap-6 lg:grid-cols-[14rem_1fr]">
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
      </div>
      <div className="space-y-6">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="bg-surface border border-border rounded-xl p-5 space-y-4">
            <Skeleton className="h-4 w-40" />
            <SkeletonText lines={4} />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/**
 * The server's settings from its config providers (`GET /api/v1/qcli/config`): one provider at a time, or every match of
 * the search. Changes are checked while typing, shown as a diff to confirm, and sent per section with its version;
 * the server's per-key errors and version conflicts are shown on their section. Other people's changes
 * (`config:changed`) refresh the page, unless they hit a section with unsaved edits: then it offers to reload.
 */
export default function ConfigPage() {
  const { t } = useI18n();
  const { data, loading, error, refetch, refresh } = useApi(getConfigOverview, []);
  const editors = useConfigEditors();
  const ws = useOptionalWebSocket();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');

  const [edits, setEdits] = useState<ByKey<Edit>>({});
  const [added, setAdded] = useState<Record<string, ConfigEntry[]>>({});
  const [serverErrors, setServerErrors] = useState<ByKey<string>>({});
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [stale, setStale] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<'saved' | 'restart' | null>(null);

  const providers = useMemo(() => [...(data?.providers ?? [])].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)), [data]);
  const selectedId = params.get('provider');
  const selected = providers.find(p => p.id === selectedId) ?? providers[0];
  const defaultStore = data?.defaultStore ?? null;
  const storeOf = (p: ConfigProvider) => effectiveStore(p, defaultStore);
  const storesInUse = useMemo(() => distinctStores(providers.map(p => effectiveStore(p, defaultStore))), [providers, defaultStore]);

  // Live refresh: sections without unsaved edits follow the server, the others say they changed
  const editsRef = useRef(edits);
  editsRef.current = edits;
  const savingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!ws) return;
    return ws.subscribe('config:changed', raw => {
      const event = raw as unknown as Partial<ConfigChangedEvent>;
      if (typeof event.provider !== 'string' || typeof event.section !== 'string') return;
      const key = sectionKey(event.provider, event.section);
      if (savingRef.current.has(key)) return; // our own save; refreshed when it answers
      const pending = editsRef.current[key];
      if (pending && Object.keys(pending).length > 0) setStale(prev => new Set(prev).add(key));
      else refresh();
    });
  }, [ws, refresh]);

  const forgetSection = useCallback((key: string) => {
    const drop = <T,>(prev: Record<string, T>) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    };
    setEdits(drop);
    setAdded(drop);
    setServerErrors(drop);
    setConflicts(prev => { const next = new Set(prev); next.delete(key); return next; });
    setStale(prev => { const next = new Set(prev); next.delete(key); return next; });
  }, []);

  /** Drops the section's unsaved edits and reads the server again. */
  const reloadSection = useCallback((key: string) => {
    forgetSection(key);
    refresh();
  }, [forgetSection, refresh]);

  function setEdit(provider: string, section: string, key: string, edit: Edit | undefined) {
    const sk = sectionKey(provider, section);
    setEdits(prev => {
      const current = { ...prev[sk] };
      if (edit) current[key] = edit;
      else delete current[key];
      return { ...prev, [sk]: current };
    });
    if (!edit) setAdded(prev => (prev[sk]?.some(e => e.key === key) ? { ...prev, [sk]: prev[sk].filter(e => e.key !== key) } : prev));
    setServerErrors(prev => {
      if (!prev[sk]?.[key]) return prev;
      const current = { ...prev[sk] };
      delete current[key];
      return { ...prev, [sk]: current };
    });
    setNotice(null);
  }

  function addKey(provider: string, section: string, entry: ConfigEntry) {
    const sk = sectionKey(provider, section);
    setAdded(prev => ({ ...prev, [sk]: [...(prev[sk] ?? []), entry] }));
    setEdit(provider, section, entry.key, { kind: 'set', draft: toDraft(entry.type, null) });
  }

  // Every section with changes, what they send and their problems
  const { pending, problems } = useMemo(() => {
    const pending: PendingSection[] = [];
    let problems = 0;
    for (const provider of providers) {
      for (const section of provider.sections) {
        const sk = sectionKey(provider.id, section.id);
        const sectionEdits = edits[sk] ?? {};
        const newKeys = added[sk] ?? [];
        const entries = [...section.entries, ...newKeys];
        const changes: Record<string, ConfigValue> = {};
        const rows: DiffRow[] = [];
        for (const [key, edit] of Object.entries(sectionEdits)) {
          const entry = entries.find(e => e.key === key);
          if (!entry) continue;
          const isNew = newKeys.includes(entry);
          if (!isNew && !isChange(entry, edit)) continue;
          const result = editChange(entry, edit);
          if ('problem' in result) {
            problems++;
            continue;
          }
          changes[key] = result.value;
          const secret = entry.sensitive || entry.type === 'secret';
          rows.push({
            key,
            label: entry.label || key,
            before: isNew ? '—' : secret ? (entry.isSet ? t('config.secretSet') : t('config.secretNotSet')) : displayValue(entry.value),
            after: secret
              ? (result.value === null ? t('config.secretCleared') : t('config.secretReplaced'))
              : result.value === null
                ? (isNew || entry.default === null ? t('config.removed') : `${displayValue(entry.default)} (${t('config.defaultValue')})`)
                : displayValue(result.value),
            requiresRestart: entry.requiresRestart,
          });
        }
        if (rows.length > 0) {
          pending.push({ provider, sectionId: section.id, title: `${provider.title} › ${section.title || section.id}`, version: section.version, changes, rows });
        }
      }
    }
    return { pending, problems };
  }, [providers, edits, added, t]);

  const changeCount = pending.reduce((n, s) => n + s.rows.length, 0);

  async function save() {
    setSaving(true);
    setSaveError(null);
    let restart = false;
    let failed = false;
    for (const section of pending) {
      const sk = sectionKey(section.provider.id, section.sectionId);
      savingRef.current.add(sk);
      try {
        const result = await updateConfigSection(section.provider.id, section.sectionId, section.changes, section.version);
        if (result?.requiresRestart) restart = true;
        forgetSection(sk);
      } catch (err) {
        failed = true;
        if (err instanceof ConfigValidationError) {
          setServerErrors(prev => ({ ...prev, [sk]: err.errors }));
        } else if (err instanceof ConfigConflictError) {
          setConflicts(prev => new Set(prev).add(sk));
        } else {
          setSaveError(`${section.title}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } finally {
        savingRef.current.delete(sk);
      }
    }
    setSaving(false);
    setConfirmOpen(false);
    if (!failed || restart) setNotice(restart ? 'restart' : 'saved');
    refresh();
  }

  function discardAll() {
    setEdits({});
    setAdded({});
    setServerErrors({});
    setConflicts(new Set());
    setNotice(null);
    if (stale.size > 0) {
      setStale(new Set());
      refresh();
    }
  }

  const searching = query.trim() !== '';
  const shown = searching
    ? providers
        .map(p => ({
          provider: p,
          sections: p.sections.filter(s => [...s.entries, ...(added[sectionKey(p.id, s.id)] ?? [])].some(e => entryMatches(e, query))),
        }))
        .filter(p => p.sections.length > 0)
    : selected
      ? [{ provider: selected, sections: selected.sections }]
      : [];
  const dirtyIn = (provider: string) => pending.some(s => s.provider.id === provider);
  const restartNeeded = pending.some(s => s.rows.some(r => r.requiresRestart));

  return (
    <div>
      <PageHeader
        title={t('config.title')}
        subtitle={t('config.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            {(changeCount > 0 || problems > 0) && (
              <button
                type="button"
                onClick={discardAll}
                disabled={saving}
                className="px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors disabled:opacity-40"
              >
                {t('config.discard')}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setSaveError(null); setConfirmOpen(true); }}
              disabled={changeCount === 0 || problems > 0 || saving}
              title={problems > 0 ? t('config.fixProblems', { count: problems }) : undefined}
              className="px-3 py-1.5 text-xs bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {changeCount > 0 ? t('config.saveCount', { count: changeCount }) : t('config.saveChanges')}
            </button>
          </div>
        }
      />
      {(defaultStore || storesInUse.length > 0) && <ConfigStoreBanner defaultStore={defaultStore} stores={storesInUse} />}

      {loading && !data ? (
        <ConfigSkeleton label={t('config.loading')} />
      ) : error && !data ? (
        <div className="p-4 sm:p-6">
          <ErrorState title={t('config.loadFailed')} error={error} onRetry={refetch} />
        </div>
      ) : providers.length === 0 ? (
        <div className="p-4 sm:p-6"><EmptyState message={t('config.noProviders')} /></div>
      ) : (
        <div className="p-4 sm:p-6 grid gap-4 lg:gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] items-start">
          <nav aria-label={t('config.providers')} className="lg:sticky lg:top-4 min-w-0">
            <ul className="flex lg:flex-col gap-1 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 lg:pb-0">
              {providers.map(p => {
                const current = !searching && p.id === selected?.id;
                const store = storeOf(p);
                return (
                  <li key={p.id} className="shrink-0">
                    <button
                      type="button"
                      aria-current={current ? 'page' : undefined}
                      onClick={() => { setQuery(''); setParams(prev => { const next = new URLSearchParams(prev); next.set('provider', p.id); return next; }, { replace: true }); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${
                        current ? 'bg-primary/15 text-heading' : 'text-muted hover:bg-control hover:text-text'
                      }`}
                    >
                      <span className="truncate">{p.title}</span>
                      {!p.writable && <span className="sr-only">({t('config.readOnly')})</span>}
                      {store && <ProviderStoreBadge store={store} />}
                      {dirtyIn(p.id) && <span aria-label={t('config.unsaved')} title={t('config.unsaved')} className={`${store ? '' : 'ml-auto '}w-1.5 h-1.5 rounded-full bg-primary shrink-0`} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="space-y-4 min-w-0">
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('config.searchPlaceholder')}
              aria-label={t('config.search')}
              className="w-full max-w-md px-3 py-1.5 text-sm bg-control border border-border rounded-lg text-text placeholder-subtle focus:outline-none focus:border-primary/50"
            />

            {notice && (
              <div role="status" className={`p-3 rounded-lg text-sm border ${notice === 'restart' ? 'bg-warning/10 border-warning/30 text-warning' : 'bg-success/10 border-success/30 text-success'}`}>
                {notice === 'restart' ? t('config.restartRequired') : t('config.saved')}
              </div>
            )}
            {saveError && !confirmOpen && <ErrorState title={t('config.saveFailed')} error={saveError} compact />}

            {searching && shown.length === 0 && <EmptyState message={t('config.noMatches')} />}

            {shown.map(({ provider, sections }) => {
              const store = storeOf(provider);
              // A provider saving to its store says where; "Reads from" stays for the others (read-only ones, the host configuration)
              const readsFrom = provider.storage && !(store && provider.storage.kind === 'store') ? provider.storage : null;
              return (
                <div key={provider.id} className="space-y-4">
                  {(searching || provider.description || store || readsFrom) && (
                    <div className="space-y-1">
                      {searching && <h2 className="text-sm font-semibold text-heading">{provider.title}</h2>}
                      {provider.description && <p className="text-xs text-subtle">{provider.description}</p>}
                      {store && <ProviderStore store={store} />}
                      {readsFrom && <ProviderStorage storage={readsFrom} />}
                    </div>
                  )}
                  {sections.length === 0 && <EmptyState message={t('config.noSections')} />}
                  {sections.map(section => {
                    const sk = sectionKey(provider.id, section.id);
                    return (
                      <ErrorBoundary key={sk} label={section.title || section.id} resetKeys={[section]}>
                        <ConfigSectionCard
                          providerId={provider.id}
                          writable={provider.writable}
                          storage={provider.storage}
                          section={section}
                          added={added[sk] ?? []}
                          edits={edits[sk] ?? {}}
                          serverErrors={serverErrors[sk] ?? {}}
                          query={query}
                          saving={saving}
                          stale={stale.has(sk)}
                          conflict={conflicts.has(sk)}
                          editors={editors}
                          onEdit={(key, edit) => setEdit(provider.id, section.id, key, edit)}
                          onAddKey={entry => addKey(provider.id, section.id, entry)}
                          onReload={() => reloadSection(sk)}
                        />
                      </ErrorBoundary>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        size="lg"
        title={t('config.confirmTitle')}
        message={
          <div className="space-y-4 text-left">
            <p>{t('config.confirmMessage', { count: changeCount })}</p>
            {pending.map(section => (
              <div key={`${section.provider.id}/${section.sectionId}`}>
                <div className="text-xs font-semibold text-heading mb-1">{section.title}</div>
                <table className="w-full text-xs">
                  <thead className="sr-only">
                    <tr><th>{t('config.key')}</th><th>{t('config.before')}</th><th>{t('config.after')}</th></tr>
                  </thead>
                  <tbody>
                    {section.rows.map(row => (
                      <tr key={row.key} className="border-t border-border/50 align-top" data-diff-key={row.key}>
                        <td className="py-1.5 pr-3 text-text break-words w-1/3">{row.label}{row.requiresRestart && <span className="text-warning"> *</span>}</td>
                        <td className="py-1.5 pr-3 font-mono text-error/90 line-through decoration-error/40 break-all">{row.before}</td>
                        <td className="py-1.5 font-mono text-success break-all">{row.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {restartNeeded && <p className="text-xs text-warning">* {t('config.restartBadge')}</p>}
          </div>
        }
        confirmLabel={t('config.confirmSave')}
        busyLabel={t('config.saving')}
        busy={saving}
        error={saveError}
        onConfirm={save}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
