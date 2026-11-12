import { useState, type FormEvent } from 'react';
import Modal from '../../components/Modal';
import { ApiError } from '../../api/client';
import { createApiToken, type ApiTokenView } from '../../api/tokens';
import { useI18n } from '../../i18n';
import {
  DEFAULT_EXPIRY_DAYS, MAX_EXPIRY_DAYS, MIN_EXPIRY_DAYS, TOKEN_NAME, errorMessage, isValidExpiry, parsePermissions,
} from './tokenInfo';

const BUTTON = 'px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors disabled:opacity-40';
const PRIMARY_BUTTON = 'px-4 py-1.5 text-xs font-medium bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors disabled:opacity-40';
const INPUT = 'w-full px-3 py-2 text-sm bg-control border border-border rounded-lg text-text placeholder:text-subtle focus:outline-none focus:border-primary/50';

interface Props {
  open: boolean;
  onClose: () => void;
  /** A token was created: refresh the list. */
  onCreated: (token: ApiTokenView) => void;
}

/** `POST /api/v1/qcli/tokens`: name, expiry and optional permissions; then the token, shown once. */
export default function NewTokenModal({ open, onClose, onCreated }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [days, setDays] = useState(String(DEFAULT_EXPIRY_DAYS));
  const [permissions, setPermissions] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const nameValid = TOKEN_NAME.test(name);
  const daysValid = isValidExpiry(days);

  function reset() {
    setName('');
    setDays(String(DEFAULT_EXPIRY_DAYS));
    setPermissions('');
    setError(null);
    setCreated(null);
    setCopied(false);
  }

  // The token is shown once: only Done closes the dialog then (not Escape or a click outside)
  function close(force = false) {
    if (busy || (created && !force)) return;
    reset();
    onClose();
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!nameValid || !daysValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createApiToken({ name, expiresInDays: Number(days), permissions: parsePermissions(permissions) });
      setCreated(res.token);
      onCreated(res.apiToken);
    } catch (err) {
      const message = errorMessage(err);
      if (err instanceof ApiError && err.status === 501) setError(t('tokens.createUnavailable'));
      else if (err instanceof ApiError && err.status === 403) setError(t('tokens.createForbidden', { message }));
      else setError(t('tokens.createFailed', { message }));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (insecure context or permission): the token can still be selected
    }
  }

  if (created) {
    return (
      <Modal
        open={open}
        onClose={() => close()}
        title={t('tokens.createdTitle')}
        actions={<button type="button" onClick={() => close(true)} className={PRIMARY_BUTTON}>{t('tokens.done')}</button>}
      >
        <div className="space-y-3">
          <p role="alert" className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs">{t('tokens.createdWarning')}</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={created}
              aria-label={t('tokens.tokenValue')}
              onFocus={e => e.currentTarget.select()}
              className={`${INPUT} font-mono text-xs min-w-0`}
            />
            <button type="button" onClick={() => void copy()} className={`${BUTTON} shrink-0`}>
              {copied ? t('tokens.copied') : t('tokens.copy')}
            </button>
          </div>
          <p className="text-xs text-subtle">{t('tokens.createdHint')}</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={() => close()}
      title={t('tokens.createTitle')}
      actions={
        <>
          <button type="button" onClick={() => close()} disabled={busy} className={BUTTON}>{t('common.cancel')}</button>
          <button type="submit" form="new-token-form" disabled={busy || !nameValid || !daysValid} className={PRIMARY_BUTTON}>
            {busy ? t('tokens.creating') : t('tokens.create')}
          </button>
        </>
      }
    >
      <form id="new-token-form" onSubmit={e => void submit(e)} className="space-y-4">
        <div>
          <label htmlFor="new-token-name" className="block text-xs text-muted mb-1">{t('tokens.name')}</label>
          <input
            id="new-token-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('tokens.namePlaceholder')}
            maxLength={64}
            autoFocus
            autoComplete="off"
            aria-invalid={name !== '' && !nameValid}
            className={INPUT}
          />
          <p className={`mt-1 text-[11px] ${name !== '' && !nameValid ? 'text-error' : 'text-subtle'}`}>{t('tokens.nameHint')}</p>
        </div>
        <div>
          <label htmlFor="new-token-days" className="block text-xs text-muted mb-1">{t('tokens.expiresInDays')}</label>
          <input
            id="new-token-days"
            type="number"
            inputMode="numeric"
            min={MIN_EXPIRY_DAYS}
            max={MAX_EXPIRY_DAYS}
            step={1}
            value={days}
            onChange={e => setDays(e.target.value)}
            aria-invalid={!daysValid}
            className={`${INPUT} max-w-[8rem]`}
          />
          <p className={`mt-1 text-[11px] ${daysValid ? 'text-subtle' : 'text-error'}`}>
            {t('tokens.expiresHint', { min: MIN_EXPIRY_DAYS, max: MAX_EXPIRY_DAYS })}
          </p>
        </div>
        <div>
          <label htmlFor="new-token-permissions" className="block text-xs text-muted mb-1">{t('tokens.permissionsOptional')}</label>
          <textarea
            id="new-token-permissions"
            value={permissions}
            onChange={e => setPermissions(e.target.value)}
            placeholder="commands:execute, data:read"
            rows={2}
            spellCheck={false}
            autoCapitalize="off"
            className={`${INPUT} font-mono text-xs resize-y`}
          />
          <p className="mt-1 text-[11px] text-subtle">{t('tokens.permissionsHint')}</p>
        </div>
        {error && <p role="alert" className="text-error text-xs break-words">{error}</p>}
      </form>
    </Modal>
  );
}
