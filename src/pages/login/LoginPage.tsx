import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import AppLogo from '../../components/AppLogo';
import { useAppName } from '../../hooks/useAppName';
import { signInHref, signInLabel } from '../../api/signIn';
import { changeOwnPassword, serverMessage } from '../../api/auth';

export default function LoginPage() {
  const { user, loading, authMode } = useAuth();
  const { t } = useI18n();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted">{t('common.loading')}</div>;
  }
  if (user) return <Navigate to="/" replace />;
  // The host application signs users in: never show (or advertise) the password form.
  return authMode.mode === 'external' ? <ExternalSignIn signInUrl={authMode.signInUrl} /> : <PasswordSignIn />;
}

function Card({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const appName = useAppName();
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm bg-surface border border-border rounded-xl p-8 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-8">
          <AppLogo size={40} />
          <div>
            <h1 className="text-xl font-bold text-heading">{appName}</h1>
            <p className="text-xs text-muted">{t('login.subtitle')}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** External mode: the host application's sign-in, then Retry (or the host's `#token=` handoff). */
function ExternalSignIn({ signInUrl }: { signInUrl: string | null }) {
  const { retry } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [checking, setChecking] = useState(false);
  const [stillSignedOut, setStillSignedOut] = useState(false);

  const handleRetry = async () => {
    setChecking(true);
    setStillSignedOut(false);
    try {
      if (await retry()) navigate('/');
      else setStillSignedOut(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card>
      <p className="text-sm text-muted mb-4">{t('login.externalHint')}</p>

      {stillSignedOut && (
        <div role="alert" className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
          {t('login.stillSignedOut')}
        </div>
      )}

      {signInUrl ? (
        <a
          href={signInHref(signInUrl)}
          className="block w-full mb-3 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-medium text-center break-all transition-colors"
        >
          {t('login.signInAt', { url: signInLabel(signInUrl) })}
        </a>
      ) : (
        <p className="mb-4 p-3 rounded-lg bg-control border border-border text-sm text-text">
          {t('login.signInThroughHost')}
        </p>
      )}

      <button
        type="button"
        onClick={handleRetry}
        disabled={checking}
        className="w-full py-2.5 rounded-lg border border-border text-text hover:bg-control font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {checking ? t('login.checking') : t('login.retry')}
      </button>
    </Card>
  );
}

const INPUT = 'w-full px-3 py-2 rounded-lg bg-control border border-border text-heading placeholder-subtle focus:outline-none focus:border-primary';

function PasswordSignIn() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Signed in with a password that must be changed first: the new password step
  const [mustChange, setMustChange] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { passwordChangeRequired } = await login(username, password);
      if (passwordChangeRequired) setMustChange(true);
      else navigate('/');
    } catch {
      setError(t('login.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  if (mustChange) return <NewPasswordStep username={username} currentPassword={password} />;

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
            {error}
          </div>
        )}

        <label className="block text-sm text-muted mb-1">{t('login.username')}</label>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-lg bg-control border border-border text-heading placeholder-subtle focus:outline-none focus:border-primary"
          placeholder="root"
          autoFocus
        />

        <label className="block text-sm text-muted mb-1">{t('login.password')}</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full mb-6 px-3 py-2 rounded-lg bg-control border border-border text-heading placeholder-subtle focus:outline-none focus:border-primary"
          placeholder="••••••••"
        />

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('login.signingIn') : t('login.signIn')}
        </button>
      </form>
    </Card>
  );
}

/**
 * The password an administrator set (or the default one) must be changed before anything else: the new password,
 * twice, then the dashboard. The server checks its rules (length) and answers with the reason.
 */
function NewPasswordStep({ username, currentPassword }: { username: string; currentPassword: string }) {
  const { retry } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mismatch = confirm.length > 0 && next !== confirm;
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return;
    if (next === currentPassword) {
      setError(t('login.sameAsCurrent'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await changeOwnPassword(username, currentPassword, next);
      if (await retry()) navigate('/');
      else setError(t('login.signInAgain'));
    } catch (err) {
      setError(t('login.passwordChangeFailed', { message: serverMessage(err) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <h2 className="text-sm font-semibold text-heading mb-1">{t('login.newPasswordTitle')}</h2>
        <p className="text-sm text-muted mb-4">{t('login.newPasswordHint', { username })}</p>
        {error && (
          <div role="alert" className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
            {error}
          </div>
        )}

        <label htmlFor="new-password" className="block text-sm text-muted mb-1">{t('login.newPassword')}</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={e => setNext(e.target.value)}
          className={`${INPUT} mb-4`}
          autoFocus
        />

        <label htmlFor="confirm-password" className="block text-sm text-muted mb-1">{t('login.confirmPassword')}</label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          aria-invalid={mismatch}
          className={`${INPUT} ${mismatch ? 'mb-1' : 'mb-6'}`}
        />
        {mismatch && <p className="mb-5 text-xs text-error">{t('login.passwordsDiffer')}</p>}

        <button
          type="submit"
          disabled={busy || !next || next !== confirm}
          className="w-full py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? t('login.settingPassword') : t('login.setPassword')}
        </button>
      </form>
    </Card>
  );
}
