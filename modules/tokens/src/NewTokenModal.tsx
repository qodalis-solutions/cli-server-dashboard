import { useState, type FormEvent } from 'react';
import { ApiError, Modal, SkeletonList, useApi } from '@qodalis/cli-server-dashboard-kit';
import { createApiToken, getPermissions, type ApiTokenView, type CliPermission } from './api';
import { useI18n } from './i18n';
import PermissionPicker from './PermissionPicker';
import {
  DEFAULT_EXPIRY_DAYS, MAX_EXPIRY_DAYS, MIN_EXPIRY_DAYS, TOKEN_NAME, errorMessage, isValidExpiry, selectedPermissions,
} from './tokenInfo';

const BUTTON = 'px-3 py-1.5 text-xs bg-control hover:bg-control-hover text-text rounded-lg transition-colors disabled:opacity-40';
const PRIMARY_BUTTON = 'px-4 py-1.5 text-xs font-medium bg-primary hover:bg-primary-hover text-on-primary rounded-lg transition-colors disabled:opacity-40';
const INPUT = 'w-full px-3 py-2 text-sm bg-control border border-border rounded-lg text-text placeholder:text-subtle focus:outline-none focus:border-primary/50';

/** `all`: unscoped (every permission the owner has, now and later); `selected`: the picked ones. */
type Scope = 'all' | 'selected';

/** The server's permission list: fetched on the first switch to Selected; `failed` on servers without it. */
type Catalog = { state: 'idle' | 'loading' | 'failed' } | { state: 'ready'; entries: CliPermission[] };

interface Props {
  open: boolean;
  onClose: () => void;
  /** A token was created: refresh the list. */
  onCreated: (token: ApiTokenView) => void;
  /** The server's permissions when the page already has them (the dialog then does not fetch them). */
  catalog?: CliPermission[];
}

/** `POST /api/v1/qcli/tokens`: name, expiry and permissions (everything, or picked from the server's list); then the token, shown once. */
export default function NewTokenModal({ open, onClose, onCreated, catalog: pageCatalog }: Props) {
  const { t } = useI18n();
  const api = useApi();
  const [name, setName] = useState('');
  const [days, setDays] = useState(String(DEFAULT_EXPIRY_DAYS));
  const [scope, setScope] = useState<Scope>('all');
  const [fetched, setFetched] = useState<Catalog>({ state: 'idle' });
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const nameValid = TOKEN_NAME.test(name);
  const daysValid = isValidExpiry(days);
  const selected = scope === 'selected' ? selectedPermissions(checked, other) : [];
  const scopeValid = scope === 'all' || selected.length > 0;
  // The page's list wins until the dialog has fetched its own (only when the page had none)
  const catalog: Catalog = fetched.state !== 'ready' && pageCatalog ? { state: 'ready', entries: pageCatalog } : fetched;
  const entries = catalog.state === 'ready' ? catalog.entries : [];

  async function loadCatalog() {
    setFetched({ state: 'loading' });
    try {
      setFetched({ state: 'ready', entries: await getPermissions(api) });
    } catch {
      // Servers before 1.0.0-beta.29 do not list their permissions: the other field still works
      setFetched({ state: 'failed' });
    }
  }

  function chooseScope(next: Scope) {
    setScope(next);
    if (next === 'selected' && (catalog.state === 'idle' || catalog.state === 'failed')) void loadCatalog();
  }

  // The set follows the catalog's order, so the token lists its permissions as the server does
  function toggle(name: string) {
    const next = new Set(checked);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setChecked(new Set(entries.map(e => e.name).filter(n => next.has(n))));
  }

  function reset() {
    setName('');
    setDays(String(DEFAULT_EXPIRY_DAYS));
    setScope('all');
    setChecked(new Set());
    setOther('');
    if (fetched.state === 'failed') setFetched({ state: 'idle' });
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
    if (!nameValid || !daysValid || !scopeValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createApiToken(api, {
        name, expiresInDays: Number(days), ...(scope === 'selected' ? { permissions: selected } : {}),
      });
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
          <button type="button" onClick={() => close()} disabled={busy} className={BUTTON}>{t('tokens.cancel')}</button>
          <button type="submit" form="new-token-form" disabled={busy || !nameValid || !daysValid || !scopeValid} className={PRIMARY_BUTTON}>
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
        <fieldset aria-describedby={scope === 'selected' && !scopeValid ? 'new-token-none-selected' : undefined}>
          <legend className="block text-xs text-muted mb-1">{t('tokens.scopeLabel')}</legend>
          <div className="space-y-1.5">
            <div>
              <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input
                  type="radio"
                  name="new-token-scope"
                  checked={scope === 'all'}
                  onChange={() => chooseScope('all')}
                  aria-describedby="new-token-scope-all-hint"
                  className="accent-primary"
                />
                {t('tokens.scopeAll')}
              </label>
              <p id="new-token-scope-all-hint" className="ml-5 text-[11px] text-subtle">{t('tokens.scopeAllHint')}</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
              <input
                type="radio"
                name="new-token-scope"
                checked={scope === 'selected'}
                onChange={() => chooseScope('selected')}
                className="accent-primary"
              />
              {t('tokens.scopeSelected')}
            </label>
          </div>
          {scope === 'selected' && (
            <div className="mt-3 space-y-2">
              {catalog.state === 'loading' && <SkeletonList items={4} label={t('tokens.loadingPage')} />}
              {catalog.state === 'failed' && <p role="status" className="text-xs text-warning">{t('tokens.catalogUnavailable')}</p>}
              {catalog.state === 'ready' && entries.length === 0 && <p role="status" className="text-xs text-muted">{t('tokens.catalogEmpty')}</p>}
              {catalog.state !== 'loading' && (
                <PermissionPicker entries={entries} checked={checked} onToggle={toggle} other={other} onOtherChange={setOther} />
              )}
              {catalog.state !== 'loading' && !scopeValid && (
                <p id="new-token-none-selected" className="text-[11px] text-error">{t('tokens.noneSelected')}</p>
              )}
            </div>
          )}
        </fieldset>
        {error && <p role="alert" className="text-error text-xs break-words">{error}</p>}
      </form>
    </Modal>
  );
}
