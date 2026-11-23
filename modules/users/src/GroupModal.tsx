import { useState, type FormEvent } from 'react';
import { Modal, useApi } from '@qodalis/cli-server-dashboard-kit';
import { createGroup, errorMessage, updateGroup, type CliPermission, type Group } from './api';
import { useI18n } from './i18n';
import { groupPermissions, parsePermissions } from './permissions';
import { BUTTON, ERROR, INPUT, LABEL, PRIMARY_BUTTON } from './ui';

interface Props {
  /** The group to edit, or `new` to create one (the page mounts the dialog while open, keyed by it). */
  target: Group | 'new';
  /** Every permission the server declares (empty: only the typed ones). */
  catalog: CliPermission[];
  onClose: () => void;
  onSaved: () => void;
}

/** Creates a group (name, description, permissions) or edits one (description, permissions; the name stays). */
export default function GroupModal({ target, catalog, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const api = useApi();
  const creating = target === 'new';
  const existing = target === 'new' ? null : target;
  const known = new Set(catalog.map(e => e.name.toLowerCase()));
  const initial = existing?.permissions ?? [];
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [checked, setChecked] = useState<ReadonlySet<string>>(() => new Set(initial.filter(p => known.has(p.toLowerCase())).map(p => p.toLowerCase())));
  // Wildcards (`*`, `jobs:*`) and permissions the catalog does not list go in the field
  const [other, setOther] = useState(() => initial.filter(p => !known.has(p.toLowerCase())).join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (permission: string) => setChecked(prev => {
    const next = new Set(prev);
    if (next.has(permission)) next.delete(permission);
    else next.add(permission);
    return next;
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const permissions = [...new Set([...checked, ...parsePermissions(other)])];
    try {
      if (target === 'new') await createGroup(api, { name: name.trim(), description: description.trim(), permissions });
      else await updateGroup(api, target.name, { description: description.trim(), permissions });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const sections = groupPermissions(catalog);
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={creating ? t('users.newGroupTitle') : t('users.editGroupTitle', { name: existing?.name ?? '' })}
      actions={
        <>
          <button type="button" onClick={onClose} className={BUTTON}>{t('users.cancel')}</button>
          <button type="submit" form="group-form" disabled={busy || !name.trim()} className={PRIMARY_BUTTON}>
            {busy ? t('users.saving') : creating ? t('users.create') : t('users.save')}
          </button>
        </>
      }
    >
      <form id="group-form" onSubmit={submit} className="space-y-4">
        {error && <div role="alert" className={ERROR}>{error}</div>}
        <div>
          <label htmlFor="group-name" className={LABEL}>{t('users.groupName')}</label>
          <input id="group-name" value={name} onChange={e => setName(e.target.value)} disabled={!creating} className={`${INPUT} font-mono`} autoComplete="off" autoFocus={creating} />
        </div>
        <div>
          <label htmlFor="group-description" className={LABEL}>{t('users.description')}</label>
          <input id="group-description" value={description} onChange={e => setDescription(e.target.value)} className={INPUT} autoComplete="off" />
        </div>
        <fieldset>
          <legend className={LABEL}>{t('users.permissions')}</legend>
          {sections.length > 0 && (
            <div className="max-h-72 overflow-y-auto space-y-3 p-3 rounded-lg border border-border bg-surface">
              {sections.map(({ group, entries }) => (
                <section key={group}>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">{group}</h4>
                  <div className="space-y-1">
                    {entries.map(entry => (
                      <label key={entry.name} className="flex items-start gap-2 text-sm text-text">
                        <input type="checkbox" checked={checked.has(entry.name.toLowerCase())} onChange={() => toggle(entry.name.toLowerCase())} className="accent-primary mt-0.5" />
                        <span>
                          <span className="font-mono text-xs">{entry.name}</span>
                          <span className="block text-[11px] text-subtle">{entry.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </fieldset>
        <div>
          <label htmlFor="group-other" className={LABEL}>{sections.length ? t('users.otherPermissions') : t('users.permissions')}</label>
          <textarea
            id="group-other"
            value={other}
            onChange={e => setOther(e.target.value)}
            placeholder="jobs:*, deploy:run"
            rows={2}
            spellCheck={false}
            autoCapitalize="off"
            className={`${INPUT} font-mono text-xs resize-y`}
          />
          <p className="mt-1 text-[11px] text-subtle">{t('users.otherPermissionsHint')}</p>
        </div>
      </form>
    </Modal>
  );
}
