import { useState, type FormEvent } from 'react';
import { Modal, useApi } from '@qodalis/cli-server-dashboard-kit';
import { createUser, errorMessage, setPassword, updateUser, type Group, type User } from './api';
import { useI18n } from './i18n';
import { BUTTON, ERROR, INPUT, LABEL, PRIMARY_BUTTON } from './ui';

interface Props {
  /** The user to edit, or `new` to create one (the page mounts the dialog while open, keyed by it). */
  target: User | 'new';
  groups: Group[];
  /** Passwords are set here (the dashboard's own sign-in); otherwise the host application owns them. */
  passwords: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Creates a user (name, email, groups, optionally a first password, temporary by default) or edits one (name,
 * email, groups, disabled). The server checks names, emails and who may add which group.
 */
export default function UserModal({ target, groups, passwords, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const api = useApi();
  const creating = target === 'new';
  const existing = target === 'new' ? null : target;
  const [name, setName] = useState(existing?.name ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [chosen, setChosen] = useState<ReadonlySet<string>>(() => new Set(existing?.groups ?? []));
  const [disabled, setDisabled] = useState(existing?.disabled ?? false);
  const [password, setPasswordText] = useState('');
  const [temporary, setTemporary] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (group: string) => setChosen(prev => {
    const next = new Set(prev);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    return next;
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // Groups the list does not show (a group deleted meanwhile) stay as they were
    const input = { name: name.trim(), email: email.trim(), groups: [...chosen], disabled };
    try {
      if (target === 'new') {
        const created = await createUser(api, input);
        if (passwords && password) await setPassword(api, created.id, password, temporary);
      } else {
        await updateUser(api, target.id, input);
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={creating ? t('users.newUserTitle') : t('users.editTitle', { name: existing?.name ?? '' })}
      actions={
        <>
          <button type="button" onClick={onClose} className={BUTTON}>{t('users.cancel')}</button>
          <button type="submit" form="user-form" disabled={busy || !name.trim() || !email.trim()} className={PRIMARY_BUTTON}>
            {busy ? t('users.saving') : creating ? t('users.create') : t('users.save')}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        {error && <div role="alert" className={ERROR}>{error}</div>}
        <div>
          <label htmlFor="user-name" className={LABEL}>{t('users.name')}</label>
          <input id="user-name" value={name} onChange={e => setName(e.target.value)} className={INPUT} autoComplete="off" autoFocus />
        </div>
        <div>
          <label htmlFor="user-email" className={LABEL}>{t('users.email')}</label>
          <input id="user-email" type="email" value={email} onChange={e => setEmail(e.target.value)} className={INPUT} autoComplete="off" />
        </div>
        <fieldset>
          <legend className={LABEL}>{t('users.groups')}</legend>
          {groups.length === 0 ? (
            <p className="text-xs text-subtle">{t('users.noGroups')}</p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {groups.map(g => (
                <label key={g.id} className="inline-flex items-center gap-2 text-sm text-text" title={g.description}>
                  <input type="checkbox" checked={chosen.has(g.name)} onChange={() => toggle(g.name)} className="accent-primary" />
                  {g.name}
                </label>
              ))}
            </div>
          )}
          {creating && <p className="mt-1 text-[11px] text-subtle">{t('users.groupsDefault')}</p>}
        </fieldset>
        <label className="inline-flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={disabled} onChange={e => setDisabled(e.target.checked)} className="accent-primary" />
          {t('users.disabledLabel')}
        </label>
        {creating && passwords && (
          <div className="space-y-2">
            <div>
              <label htmlFor="user-password" className={LABEL}>{t('users.firstPassword')}</label>
              <input id="user-password" type="password" autoComplete="new-password" value={password} onChange={e => setPasswordText(e.target.value)} className={INPUT} />
              <p className="mt-1 text-[11px] text-subtle">{t('users.firstPasswordHint')}</p>
            </div>
            {password && (
              <label className="inline-flex items-center gap-2 text-sm text-text">
                <input type="checkbox" checked={temporary} onChange={e => setTemporary(e.target.checked)} className="accent-primary" />
                {t('users.temporary')}
              </label>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
