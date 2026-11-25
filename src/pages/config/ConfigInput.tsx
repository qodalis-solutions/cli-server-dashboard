import { useState } from 'react';
import { useI18n } from '../../i18n';
import type { ConfigEntry, ConfigValue } from '../../types';
import { toDraft, type Draft, type Edit } from './configValue';
import type { ConfigEditor } from './configEditors';
import ConfigEditorHost from './ConfigEditorHost';

const FIELD =
  'w-full px-3 py-1.5 text-sm bg-control border rounded-lg text-text placeholder-subtle focus:outline-none focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed';

function fieldClass(invalid: boolean, width = 'max-w-sm') {
  return `${FIELD} ${width} ${invalid ? 'border-error/60' : 'border-border'}`;
}

/** A list of strings as removable tags; Enter or a comma adds the typed value. */
export function TagInput({ id, value, onChange, disabled, label, invalid }: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  disabled: boolean;
  label: string;
  invalid: boolean;
}) {
  const { t } = useI18n();
  const [input, setInput] = useState('');

  function addTag() {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInput('');
  }

  return (
    <div className={`flex flex-wrap gap-1.5 p-2 bg-control border rounded-lg min-h-[38px] max-w-xl ${invalid ? 'border-error/60' : 'border-border'} ${disabled ? 'opacity-50' : ''}`}>
      {value.map(tag => (
        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/20 text-accent rounded text-xs font-mono break-all">
          {tag}
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(value.filter(v => v !== tag))}
              aria-label={t('config.removeValue', { value: tag })}
              title={t('config.removeValue', { value: tag })}
              className="text-accent hover:text-heading ml-0.5">×</button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          id={id}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addTag();
            } else if (e.key === 'Backspace' && input === '' && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={addTag}
          placeholder={t('config.addValue')}
          aria-label={label}
          className="flex-1 bg-transparent text-xs text-text placeholder-subtle focus:outline-none min-w-[80px]"
        />
      )}
    </div>
  );
}

/** A secret: never shown; Replace types a new one, Clear removes it (the server's default applies again). */
function SecretInput({ id, entry, edit, onEdit, disabled, label, invalid }: {
  id: string;
  entry: ConfigEntry;
  edit: Edit | undefined;
  onEdit: (edit: Edit | undefined) => void;
  disabled: boolean;
  label: string;
  invalid: boolean;
}) {
  const { t } = useI18n();
  if (edit?.kind === 'reset') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-warning">{t('config.secretWillClear')}</span>
        <button type="button" onClick={() => onEdit(undefined)} className="px-2 py-1 rounded-md bg-control hover:bg-control-hover text-text">{t('config.undo')}</button>
      </div>
    );
  }
  if (edit?.kind === 'set') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          type="password"
          autoComplete="new-password"
          value={String(edit.draft)}
          disabled={disabled}
          onChange={e => onEdit({ kind: 'set', draft: e.target.value })}
          placeholder={t('config.newSecret')}
          aria-label={label}
          aria-invalid={invalid || undefined}
          autoFocus
          className={fieldClass(invalid, 'max-w-xs')}
        />
        <button type="button" onClick={() => onEdit(undefined)} className="px-2 py-1 text-xs rounded-md bg-control hover:bg-control-hover text-text">{t('config.cancelEdit')}</button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-mono text-subtle">{entry.isSet ? '••••••••' : t('config.secretNotSet')}</span>
      {!disabled && (
        <>
          <button type="button" onClick={() => onEdit({ kind: 'set', draft: '' })} className="px-2 py-1 rounded-md bg-control hover:bg-control-hover text-text">
            {entry.isSet ? t('config.replaceSecret') : t('config.setSecret')}
          </button>
          {entry.isSet && (
            <button type="button" onClick={() => onEdit({ kind: 'reset' })} className="px-2 py-1 rounded-md bg-control hover:bg-error/15 text-error">
              {t('config.clearSecret')}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export interface ConfigInputProps {
  /** The input's id; the row's label points at it. */
  id: string;
  entry: ConfigEntry;
  edit: Edit | undefined;
  onEdit: (edit: Edit | undefined) => void;
  disabled: boolean;
  /** The message shown under the input (validation or the server's), if any. */
  error?: string;
  /** Custom editors by `editor` hint. */
  editors?: ReadonlyMap<string, ConfigEditor>;
}

/** The input for an entry: a custom editor for its `editor` hint, else the one of its type. */
export default function ConfigInput({ id, entry, edit, onEdit, disabled, error, editors }: ConfigInputProps) {
  const { t } = useI18n();
  const label = entry.label || entry.key;
  const invalid = !!error;
  const draft: Draft = edit?.kind === 'set' ? edit.draft : toDraft(entry.type, edit?.kind === 'reset' ? entry.default : entry.value);
  const setDraft = (next: Draft) => onEdit({ kind: 'set', draft: next });
  const common = { id, disabled, 'aria-label': label, 'aria-invalid': invalid || undefined } as const;

  const Custom = entry.editor ? editors?.get(entry.editor) : undefined;
  if (Custom && !entry.sensitive) {
    const value: ConfigValue = edit?.kind === 'value' ? edit.value : edit?.kind === 'reset' ? entry.default : entry.value;
    return (
      <ConfigEditorHost
        editor={Custom}
        props={{ entry, value, onChange: (v: unknown) => onEdit({ kind: 'value', value: v as ConfigValue }), disabled, error }}
      />
    );
  }

  if (entry.type === 'secret' || entry.sensitive) {
    return <SecretInput id={id} entry={entry} edit={edit} onEdit={onEdit} disabled={disabled} label={label} invalid={invalid} />;
  }

  switch (entry.type) {
    case 'boolean': {
      const checked = draft === true;
      return (
        <button
          {...common}
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => setDraft(!checked)}
          title={checked ? t('common.enabled') : t('common.disabled')}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed ${checked ? 'bg-primary' : 'bg-subtle'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-on-primary transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      );
    }
    case 'string[]':
      return <TagInput id={id} value={Array.isArray(draft) ? draft : []} onChange={setDraft} disabled={disabled} label={label} invalid={invalid} />;
    case 'enum': {
      const options = entry.validation?.options ?? [];
      const current = String(draft);
      return (
        <select {...common} value={current} onChange={e => setDraft(e.target.value)} className={fieldClass(invalid, 'max-w-xs')}>
          {!options.includes(current) && <option value={current}>{current || t('config.chooseOption')}</option>}
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    case 'number':
      return (
        <input
          {...common}
          type="number"
          inputMode="decimal"
          min={entry.validation?.min}
          max={entry.validation?.max}
          value={String(draft)}
          onChange={e => setDraft(e.target.value)}
          className={fieldClass(invalid, 'max-w-[12rem]')}
        />
      );
    case 'json':
      return (
        <textarea
          {...common}
          value={String(draft)}
          onChange={e => setDraft(e.target.value)}
          spellCheck={false}
          rows={Math.min(12, Math.max(3, String(draft).split('\n').length))}
          className={`${fieldClass(invalid, 'max-w-xl')} font-mono text-xs`}
        />
      );
    case 'duration':
      return (
        <input
          {...common}
          type="text"
          value={String(draft)}
          onChange={e => setDraft(e.target.value)}
          placeholder={t('config.durationHint')}
          className={`${fieldClass(invalid, 'max-w-[12rem]')} font-mono`}
        />
      );
    case 'url':
      return (
        <input
          {...common}
          type="url"
          inputMode="url"
          value={String(draft)}
          onChange={e => setDraft(e.target.value)}
          placeholder="https://"
          className={`${fieldClass(invalid, 'max-w-md')} font-mono`}
        />
      );
    default:
      if (entry.editor === 'textarea' || entry.editor === 'code') {
        return (
          <textarea
            {...common}
            value={String(draft)}
            onChange={e => setDraft(e.target.value)}
            rows={Math.min(10, Math.max(3, String(draft).split('\n').length))}
            className={`${fieldClass(invalid, 'max-w-xl')} ${entry.editor === 'code' ? 'font-mono text-xs' : ''}`}
          />
        );
      }
      return (
        <input
          {...common}
          type="text"
          value={String(draft)}
          onChange={e => setDraft(e.target.value)}
          className={fieldClass(invalid)}
        />
      );
  }
}
