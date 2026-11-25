import { useEffect, useRef, useState } from 'react';
import Badge from '../../components/Badge';
import Select from '../../components/Select';
import { useI18n } from '../../i18n';
import { useRestart } from '../../context/RestartContext';
import { configRestartId } from '../../api/restart';
import type { ConfigEntry, ConfigEntryType, ConfigProviderStorage, ConfigSection } from '../../types';
import ConfigInput from './ConfigInput';
import { sourceText } from './configSource';
import type { ConfigEditor } from './configEditors';
import { CONFIG_KEY, FREE_KEY_TYPES, displayValue, editChange, entryMatches, isChange, sameValue, type Edit, type ValueProblem } from './configValue';

export interface ConfigSectionCardProps {
  providerId: string;
  /** The provider accepts changes at all. */
  writable: boolean;
  /** Where the provider reads from; names the entries' file source when it is the host's configuration. */
  storage?: ConfigProviderStorage;
  section: ConfigSection;
  /** The section a link pointed at (`?section=`): scrolled into view once and outlined. */
  highlighted?: boolean;
  /** Free keys added in the dashboard and not saved yet. */
  added: ConfigEntry[];
  edits: Record<string, Edit>;
  /** The server's messages per key from the last save. */
  serverErrors: Record<string, string>;
  query: string;
  saving: boolean;
  /** The section changed on the server while it had unsaved edits. */
  stale: boolean;
  /** The last save of this section hit a newer version (409). */
  conflict: boolean;
  editors: ReadonlyMap<string, ConfigEditor>;
  onEdit: (key: string, edit: Edit | undefined) => void;
  onAddKey: (entry: ConfigEntry) => void;
  onReload: () => void;
}

function problemText(t: ReturnType<typeof useI18n>['t'], problem: ValueProblem) {
  return t(problem.key, problem.params);
}

/** A section of a provider: its entries (only those matching the search), badges, inputs and free keys. */
export default function ConfigSectionCard(props: ConfigSectionCardProps) {
  const { providerId, writable, storage, section, highlighted = false, added, edits, serverErrors, query, saving, stale, conflict, editors, onEdit, onAddKey, onReload } = props;
  const { t } = useI18n();
  const { isPending } = useRestart();
  const sectionWritable = writable && section.mutable;
  const entries = [...section.entries, ...added].filter(e => entryMatches(e, query));
  const declared = new Set(section.entries.map(e => e.key));
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    if (highlighted) element.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [highlighted]);

  return (
    <section
      ref={element}
      id={`cfg-section-${providerId}-${section.id}`}
      aria-labelledby={`cfg-${providerId}-${section.id}`}
      aria-current={highlighted ? 'location' : undefined}
      data-highlighted={highlighted || undefined}
      className={`bg-surface border rounded-xl overflow-hidden scroll-mt-4 ${highlighted ? 'border-primary ring-2 ring-primary/40' : 'border-border'}`}
    >
      <div className="px-4 sm:px-5 py-3 border-b border-border/75 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 id={`cfg-${providerId}-${section.id}`} className="text-sm font-semibold text-heading">{section.title || section.id}</h3>
        {!sectionWritable && <Badge variant="neutral">{t('config.readOnly')}</Badge>}
        {section.description && <p className="basis-full text-xs text-subtle">{section.description}</p>}
      </div>

      {stale && (
        <div role="status" className="px-4 sm:px-5 py-2 bg-warning/10 border-b border-warning/30 text-warning text-xs flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-[12rem]">{t('config.changedOnServer')}</span>
          <button type="button" onClick={onReload} className="px-2 py-1 rounded-md border border-warning/40 hover:bg-warning/10">{t('config.reload')}</button>
        </div>
      )}
      {conflict && (
        <div role="alert" className="px-4 sm:px-5 py-2 bg-error/[0.06] border-b border-error/30 text-error text-xs flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-[12rem]">{t('config.conflict')}</span>
          <button type="button" onClick={onReload} className="px-2 py-1 rounded-md border border-error/40 hover:bg-error/10">{t('config.reload')}</button>
        </div>
      )}

      {entries.length === 0 && section.entries.length + added.length > 0 && (
        <div className="px-5 py-4 text-xs text-subtle">{t('config.noMatches')}</div>
      )}
      {section.entries.length + added.length === 0 && (
        <div className="px-5 py-4 text-xs text-subtle">{t('config.noEntries')}</div>
      )}

      <div className="divide-y divide-border/50">
        {entries.map(entry => (
          <EntryRow
            key={entry.key}
            id={`cfg-${providerId}-${section.id}-${entry.key}`}
            entry={entry}
            storage={storage}
            editable={sectionWritable && entry.mutable}
            freeKey={section.allowCustomKeys && !entry.sensitive && entry.default === null}
            pendingRestart={entry.requiresRestart && isPending(configRestartId(providerId, section.id, entry.key))}
            isNew={added.includes(entry)}
            edit={edits[entry.key]}
            serverError={serverErrors[entry.key]}
            saving={saving}
            editors={editors}
            onEdit={edit => onEdit(entry.key, edit)}
          />
        ))}
      </div>

      {sectionWritable && section.allowCustomKeys && !query.trim() && (
        <AddKeyRow
          taken={key => declared.has(key) || added.some(e => e.key === key)}
          disabled={saving}
          onAdd={onAddKey}
        />
      )}
    </section>
  );
}

function EntryRow({ id, entry, storage, editable, freeKey, pendingRestart, isNew, edit, serverError, saving, editors, onEdit }: {
  id: string;
  entry: ConfigEntry;
  storage: ConfigProviderStorage | undefined;
  editable: boolean;
  freeKey: boolean;
  /** Changed, and the change waits for a restart. */
  pendingRestart: boolean;
  isNew: boolean;
  edit: Edit | undefined;
  serverError: string | undefined;
  saving: boolean;
  editors: ReadonlyMap<string, ConfigEditor>;
  onEdit: (edit: Edit | undefined) => void;
}) {
  const { t } = useI18n();
  const label = entry.label || entry.key;
  const changed = !!edit && (isNew || isChange(entry, edit));
  const result = edit && changed ? editChange(entry, edit) : null;
  const problem = result && 'problem' in result ? problemText(t, result.problem) : undefined;
  const error = problem ?? serverError;
  const source = sourceText(entry.source, storage);
  const secret = entry.sensitive || entry.type === 'secret';
  const canReset = editable && !secret && !isNew && edit?.kind !== 'reset'
    && (freeKey || !sameValue(entry.value, entry.default) || entry.source !== 'default');

  return (
    <div className={`px-4 sm:px-5 py-3 flex flex-col md:flex-row md:items-start gap-2 md:gap-6 ${changed ? 'bg-primary/[0.04]' : ''}`} data-config-key={entry.key}>
      <div className="md:w-64 shrink-0 min-w-0">
        <label htmlFor={id} className="block text-sm text-text break-words">{label}</label>
        {label !== entry.key && <div className="text-[11px] font-mono text-subtle break-all">{entry.key}</div>}
        {entry.description && <div className="text-[11px] text-subtle mt-0.5">{entry.description}</div>}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {!isNew && (
            <span title={t(source.hint)} data-source={entry.source} className="inline-flex">
              <Badge variant="neutral">{t(source.label)}</Badge>
            </span>
          )}
          {pendingRestart ? (
            <span title={t('restart.pendingBadgeHint')} data-pending-restart className="inline-flex">
              <Badge variant="warning">⟳ {t('restart.pendingBadge')}</Badge>
            </span>
          ) : entry.requiresRestart && <Badge variant="neutral">{t('config.restartBadge')}</Badge>}
          {!editable && <Badge variant="neutral">{t('config.readOnly')}</Badge>}
          {secret && (entry.isSet ? <Badge variant="info">{t('config.secretSet')}</Badge> : <Badge variant="neutral">{t('config.secretNotSet')}</Badge>)}
          {changed && <Badge variant="info">{t('config.modified')}</Badge>}
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {editable ? (
          edit?.kind === 'reset' && !secret ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-warning">
                {freeKey ? t('config.willRemove') : t('config.willReset', { value: displayValue(entry.default) })}
              </span>
              <button type="button" onClick={() => onEdit(undefined)} className="px-2 py-1 rounded-md bg-control hover:bg-control-hover text-text">{t('config.undo')}</button>
            </div>
          ) : (
            <ConfigInput id={id} entry={entry} edit={edit} onEdit={onEdit} disabled={saving} error={error} editors={editors} />
          )
        ) : (
          <div id={id} className="text-sm font-mono text-text break-all whitespace-pre-wrap">
            {secret ? (entry.isSet ? '••••••••' : '—') : displayValue(entry.value)}
          </div>
        )}
        {error && <div role="alert" className="text-xs text-error">{error}</div>}
        {editable && (canReset || (edit && edit.kind !== 'reset')) && (
          <div className="flex flex-wrap gap-3 text-[11px]">
            {edit && !secret && (
              <button type="button" onClick={() => onEdit(undefined)} className="text-subtle hover:text-text underline-offset-2 hover:underline">{t('config.undo')}</button>
            )}
            {canReset && (
              <button type="button" onClick={() => onEdit({ kind: 'reset' })} className="text-subtle hover:text-text underline-offset-2 hover:underline">
                {freeKey ? t('config.removeKey') : t('config.resetToDefault')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Adds a key the section does not declare (sections with `allowCustomKeys`). */
function AddKeyRow({ taken, disabled, onAdd }: { taken: (key: string) => boolean; disabled: boolean; onAdd: (entry: ConfigEntry) => void }) {
  const { t } = useI18n();
  const [key, setKey] = useState('');
  const [type, setType] = useState<ConfigEntryType>('string');
  const [error, setError] = useState<string | null>(null);

  function add() {
    const k = key.trim();
    if (!CONFIG_KEY.test(k)) return setError(t('config.invalidKey'));
    if (taken(k)) return setError(t('config.keyExists', { key: k }));
    onAdd({ key: k, label: k, description: '', type, value: null, default: null, source: 'runtime', mutable: true, requiresRestart: false, sensitive: false });
    setKey('');
    setError(null);
  }

  return (
    <div className="px-4 sm:px-5 py-3 border-t border-border/75">
      <div className="text-xs font-medium text-muted mb-2">{t('config.addKey')}</div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={key}
          onChange={e => { setKey(e.target.value); setError(null); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={t('config.newKeyPlaceholder')}
          aria-label={t('config.newKey')}
          disabled={disabled}
          className="flex-1 min-w-[10rem] max-w-xs px-3 py-2 text-sm font-mono bg-control border border-border rounded-lg text-text placeholder-subtle focus:outline-none focus:border-primary/50"
        />
        <Select
          value={type}
          onChange={setType}
          options={FREE_KEY_TYPES.map(ty => ({ value: ty, label: ty }))}
          label={t('config.newKeyType')}
          disabled={disabled}
          size="md"
          width="auto"
        />
        <button
          type="button"
          onClick={add}
          disabled={disabled || !key.trim()}
          className="px-3 py-2 text-sm bg-control hover:bg-control-hover text-text rounded-lg disabled:opacity-40"
        >
          {t('config.add')}
        </button>
      </div>
      {error && <div role="alert" className="mt-1.5 text-xs text-error">{error}</div>}
    </div>
  );
}
