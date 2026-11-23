import { useState, type FormEvent } from 'react';
import { Modal, useApi } from '@qodalis/cli-server-dashboard-kit';
import { errorMessage, setPassword, type User } from './api';
import { useI18n } from './i18n';
import { BUTTON, ERROR, INPUT, LABEL, PRIMARY_BUTTON } from './ui';

interface Props {
  /** Whose password (the page mounts the dialog while open, keyed by it). */
  target: User;
  onClose: () => void;
  onSaved: () => void;
}

/** Sets someone's password (`users:update`), temporary by default: they choose their own at the next sign-in. */
export default function PasswordModal({ target, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const api = useApi();
  const [password, setPasswordText] = useState('');
  const [confirm, setConfirm] = useState('');
  const [temporary, setTemporary] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && password !== confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      await setPassword(api, target.id, password, temporary);
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
      title={t('users.setPasswordTitle', { name: target.name })}
      description={t('users.setPasswordHint')}
      actions={
        <>
          <button type="button" onClick={onClose} className={BUTTON}>{t('users.cancel')}</button>
          <button type="submit" form="password-form" disabled={busy || !password || password !== confirm} className={PRIMARY_BUTTON}>
            {busy ? t('users.saving') : t('users.setPassword')}
          </button>
        </>
      }
    >
      <form id="password-form" onSubmit={submit} className="space-y-4">
        {error && <div role="alert" className={ERROR}>{error}</div>}
        <div>
          <label htmlFor="set-password" className={LABEL}>{t('users.newPassword')}</label>
          <input id="set-password" type="password" autoComplete="new-password" value={password} onChange={e => setPasswordText(e.target.value)} className={INPUT} autoFocus />
        </div>
        <div>
          <label htmlFor="set-password-confirm" className={LABEL}>{t('users.confirmPassword')}</label>
          <input id="set-password-confirm" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} aria-invalid={mismatch} className={INPUT} />
          {mismatch && <p className="mt-1 text-xs text-error">{t('users.passwordsDiffer')}</p>}
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-text">
          <input type="checkbox" checked={temporary} onChange={e => setTemporary(e.target.checked)} className="accent-primary" />
          {t('users.temporary')}
        </label>
      </form>
    </Modal>
  );
}
