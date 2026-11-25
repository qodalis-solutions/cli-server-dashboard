import { useEffect, useState, type FormEvent } from 'react';
import { ChipList, ErrorState, PageHeader, SkeletonGroup, Skeleton, useApi, useAsync, useDashboard } from '@qodalis/cli-server-dashboard-kit';
import {
  changeOwnPassword, errorMessage, getAuthMode, getCurrentSession, getPermissionCatalog, updateUser, type CliPermission, type CurrentSession,
} from './api';
import { useI18n } from './i18n';
import { canChangePassword, groupPermissions } from './permissions';
import { CARD, CHIP, ERROR, INPUT, LABEL, NOTICE, PRIMARY_BUTTON } from './ui';

/**
 * The signed-in user's own page (`/x/account`, in the account menu): their profile (email editable), their password
 * when this server keeps it (not when the host application signs users in or manages them), and what they may do.
 */
export default function AccountPage() {
  const { t } = useI18n();
  const api = useApi();
  const { data, loading, error, refresh } = useAsync(async () => {
    const [session, mode] = await Promise.all([
      getCurrentSession(api),
      getAuthMode(api).then(m => m.mode, () => 'password' as const),
    ]);
    return { session, authMode: mode === 'external' ? 'external' as const : 'password' as const };
  }, [api]);

  return (
    <div>
      <PageHeader title={t('users.accountTitle')} subtitle={data?.session.user.name ?? t('users.loadingPage')} />
      <div className="p-4 sm:p-6 grid gap-4 lg:grid-cols-2 items-start">
        {loading && !data && (
          <SkeletonGroup label={t('users.loading')} className="contents">
            {[3, 4, 2].map((rows, i) => (
              <div key={i} className="bg-surface border border-border rounded-xl p-5 space-y-3">
                <Skeleton className="h-4 w-32" />
                {Array.from({ length: rows }, (_, r) => <Skeleton key={r} className="h-8 w-full rounded-lg" />)}
              </div>
            ))}
          </SkeletonGroup>
        )}
        {error && <ErrorState className="lg:col-span-2" title={t('users.error', { message: errorMessage(new Error(error)) })} onRetry={refresh} />}
        {data && (
          <>
            <Profile key={data.session.user.email} session={data.session} onSaved={refresh} />
            <Password session={data.session} authMode={data.authMode} />
            <Permissions session={data.session} />
          </>
        )}
      </div>
    </div>
  );
}

function Profile({ session, onSaved }: { session: CurrentSession; onSaved: () => void }) {
  const { t, formatDate, formatRelative } = useI18n();
  const api = useApi();
  const { notify } = useDashboard();
  const { user } = session;
  const [email, setEmail] = useState(user.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateUser(api, user.id, { email: email.trim() });
      notify(t('users.profileSaved'), 'success');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={CARD} aria-labelledby="account-profile">
      <h2 id="account-profile" className="text-sm font-semibold text-heading mb-4">{t('users.profile')}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm mb-4">
        <dt className="text-muted">{t('users.name')}</dt>
        <dd className="text-heading">{user.name}</dd>
        <dt className="text-muted">{t('users.groups')}</dt>
        <dd><ChipList items={user.groups} max={8} chipClassName={CHIP} title={t('users.groupsOf', { name: user.name })} empty="–" /></dd>
        <dt className="text-muted">{t('users.memberSince')}</dt>
        <dd className="text-text">{formatDate(user.createdAt, { dateStyle: 'medium' })}</dd>
        {user.lastLoginAt !== undefined && (
          <>
            <dt className="text-muted">{t('users.lastSignIn')}</dt>
            <dd className="text-text" title={formatDate(user.lastLoginAt)}>{formatRelative(user.lastLoginAt)}</dd>
          </>
        )}
      </dl>
      {session.usersReadOnly ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-sm">
          <dt className="text-muted">{t('users.email')}</dt>
          <dd className="text-text break-all">{user.email || '–'}</dd>
        </dl>
      ) : (
        <form onSubmit={save} className="space-y-3">
          {error && <div role="alert" className={ERROR}>{error}</div>}
          <div>
            <label htmlFor="account-email" className={LABEL}>{t('users.email')}</label>
            <input id="account-email" type="email" value={email} onChange={e => setEmail(e.target.value)} className={INPUT} autoComplete="email" />
          </div>
          <button type="submit" disabled={busy || !email.trim() || email.trim() === user.email} className={PRIMARY_BUTTON}>
            {busy ? t('users.saving') : t('users.save')}
          </button>
        </form>
      )}
    </section>
  );
}

function Password({ session, authMode }: { session: CurrentSession; authMode: 'password' | 'external' }) {
  const { t } = useI18n();
  const api = useApi();
  const { notify } = useDashboard();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = confirm.length > 0 && next !== confirm;

  if (!canChangePassword(authMode, session.usersReadOnly)) {
    return (
      <section className={CARD} aria-labelledby="account-password">
        <h2 id="account-password" className="text-sm font-semibold text-heading mb-2">{t('users.password')}</h2>
        <p className={NOTICE}>{authMode === 'external' ? t('users.passwordExternal') : t('users.passwordManagedByHost')}</p>
      </section>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) return;
    if (next === current) {
      setError(t('users.sameAsCurrent'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changeOwnPassword(api, session.user.id, current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      notify(t('users.passwordChanged'), 'success');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={CARD} aria-labelledby="account-password">
      <h2 id="account-password" className="text-sm font-semibold text-heading mb-1">{t('users.changePassword')}</h2>
      <p className="text-xs text-subtle mb-4">{t('users.changePasswordHint')}</p>
      <form onSubmit={submit} className="space-y-3">
        {error && <div role="alert" className={ERROR}>{error}</div>}
        <div>
          <label htmlFor="account-current" className={LABEL}>{t('users.currentPassword')}</label>
          <input id="account-current" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label htmlFor="account-new" className={LABEL}>{t('users.newPassword')}</label>
          <input id="account-new" type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label htmlFor="account-confirm" className={LABEL}>{t('users.confirmPassword')}</label>
          <input id="account-confirm" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} aria-invalid={mismatch} className={INPUT} />
          {mismatch && <p className="mt-1 text-xs text-error">{t('users.passwordsDiffer')}</p>}
        </div>
        <button type="submit" disabled={busy || !current || !next || next !== confirm} className={PRIMARY_BUTTON}>
          {busy ? t('users.saving') : t('users.changePassword')}
        </button>
      </form>
    </section>
  );
}

function Permissions({ session }: { session: CurrentSession }) {
  const { t } = useI18n();
  const api = useApi();
  // The server's list of what this user holds, with descriptions; servers without it: the session's names
  const [held, setHeld] = useState<CliPermission[] | null>(null);
  useEffect(() => {
    let active = true;
    getPermissionCatalog(api)
      .then(entries => { if (active) setHeld(entries); })
      .catch(() => {});
    return () => { active = false; };
  }, [api]);

  const everything = session.permissions.includes('*');
  return (
    <section className={`${CARD} lg:col-span-2`} aria-labelledby="account-permissions">
      <h2 id="account-permissions" className="text-sm font-semibold text-heading mb-1">{t('users.yourPermissions')}</h2>
      <p className="text-xs text-subtle mb-4">{t('users.yourPermissionsHint')}</p>
      {everything && <p className={`${NOTICE} mb-4`}>{t('users.allPermissions')}</p>}
      {held && held.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groupPermissions(held).map(({ group, entries }) => (
            <div key={group}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">{group}</h3>
              <ul className="space-y-1">
                {entries.map(entry => (
                  <li key={entry.name} className="text-sm">
                    <span className="font-mono text-xs text-text">{entry.name}</span>
                    <span className="block text-[11px] text-subtle">{entry.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : !everything && (
        <span className="flex flex-wrap gap-1">
          {session.permissions.length ? session.permissions.map(p => <span key={p} className={CHIP}>{p}</span>) : <span className="text-xs text-subtle">{t('users.noPermissions')}</span>}
        </span>
      )}
    </section>
  );
}
