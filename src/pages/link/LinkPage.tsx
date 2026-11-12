import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { getToken } from '../../api/client';
import { decideLink, fetchLinkRequest, normalizeCode, signInForLink, type LinkRequestView } from '../../api/link';
import { fetchAuthMode, PASSWORD_MODE, type AuthMode } from '../../api/signIn';
import { useI18n } from '../../i18n';
import AppLogo from '../../components/AppLogo';
import { useAppName } from '../../hooks/useAppName';

type State =
  | { step: 'code' }
  | { step: 'loading' }
  | { step: 'signIn' }
  | { step: 'review'; request: LinkRequestView }
  | { step: 'approved' }
  | { step: 'denied' }
  | { step: 'notFound' }
  | { step: 'error'; message: string };

const input =
  'w-full px-3 py-2 rounded-lg bg-control border border-border text-heading placeholder-subtle focus:outline-none focus:border-primary';
const primary =
  'w-full py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const secondary =
  'w-full py-2.5 rounded-lg border border-border text-text hover:bg-control font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

function Card({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const appName = useAppName();
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-surface border border-border rounded-xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <AppLogo size={40} />
          <div>
            <h1 className="text-xl font-bold text-heading">{appName}</h1>
            <p className="text-xs text-muted">{t('link.subtitle')}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="mb-4 p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
      {children}
    </div>
  );
}

/**
 * `/link?code=ABCD-2345`: approve or deny a terminal's link request (`server add`). Any user of the
 * server may approve; the session made here is kept in memory only.
 */
export default function LinkPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [code, setCode] = useState<string | null>(() => normalizeCode(params.get('code') ?? ''));
  const [token, setToken] = useState<string | null>(() => getToken());
  const [state, setState] = useState<State>(() => (code ? { step: 'loading' } : { step: 'code' }));
  const [authMode, setAuthMode] = useState<AuthMode>(PASSWORD_MODE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    void fetchAuthMode().then(setAuthMode);
  }, []);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    void fetchLinkRequest(code, token).then((lookup) => {
      if (cancelled) return;
      if (lookup.kind === 'found') setState({ step: 'review', request: lookup.request });
      else if (lookup.kind === 'unauthorized') setState({ step: 'signIn' });
      else if (lookup.kind === 'notFound') setState({ step: 'notFound' });
      else setState({ step: 'error', message: lookup.message });
    });
    return () => {
      cancelled = true;
    };
  }, [code, token, attempt]);

  // Each new code or sign-in looks the request up again (the effect above)
  const lookUp = (next: { code?: string; token?: string | null }) => {
    setState({ step: 'loading' });
    setAttempt((n) => n + 1);
    if (next.code !== undefined) setCode(next.code);
    if (next.token !== undefined) setToken(next.token);
  };

  const decide = async (decision: 'approve' | 'deny') => {
    if (!code) return;
    setState({ step: 'loading' });
    const failed = await decideLink(code, decision, token);
    if (!failed) setState({ step: decision === 'approve' ? 'approved' : 'denied' });
    else if (failed.status === 404) setState({ step: 'notFound' });
    else setState({ step: 'error', message: failed.error });
  };

  return (
    <Card>
      {state.step === 'code' && <CodeForm onCode={(c) => lookUp({ code: c })} />}
      {state.step === 'loading' && <p className="text-sm text-muted">{t('common.loading')}</p>}
      {state.step === 'signIn' &&
        (authMode.mode === 'external' ? (
          <ExternalSignIn signInUrl={authMode.signInUrl} onRetry={() => lookUp({ token: getToken() })} />
        ) : (
          <SignInForm onToken={(tk) => lookUp({ token: tk })} />
        ))}
      {state.step === 'review' && <Review request={state.request} onDecide={decide} />}
      {state.step === 'approved' && (
        <div role="status">
          <h2 className="text-lg font-semibold text-heading mb-2">{t('link.approvedTitle')}</h2>
          <p className="text-sm text-muted">{t('link.backToTerminal')}</p>
        </div>
      )}
      {state.step === 'denied' && (
        <div role="status">
          <h2 className="text-lg font-semibold text-heading mb-2">{t('link.deniedTitle')}</h2>
          <p className="text-sm text-muted">{t('link.deniedHint')}</p>
        </div>
      )}
      {state.step === 'notFound' && (
        <>
          <Alert>{t('link.notFound')}</Alert>
          <button type="button" className={secondary} onClick={() => { setCode(null); setState({ step: 'code' }); }}>
            {t('link.enterAnotherCode')}
          </button>
        </>
      )}
      {state.step === 'error' && <Alert>{state.message}</Alert>}
    </Card>
  );
}

function CodeForm({ onCode }: { onCode: (code: string) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const code = normalizeCode(value);
    if (code) onCode(code);
    else setInvalid(true);
  };
  return (
    <form onSubmit={submit}>
      <p className="text-sm text-muted mb-4">{t('link.codeHint')}</p>
      {invalid && <Alert>{t('link.invalidCode')}</Alert>}
      <label htmlFor="link-code" className="block text-sm text-muted mb-1">{t('link.code')}</label>
      <input
        id="link-code"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={`${input} mb-4 font-mono tracking-widest uppercase`}
        placeholder="ABCD-2345"
        autoComplete="off"
        autoFocus
      />
      <button type="submit" className={primary} disabled={!value.trim()}>{t('link.continue')}</button>
    </form>
  );
}

function SignInForm({ onToken }: { onToken: (token: string) => void }) {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const token = await signInForLink(username, password);
      if (token) onToken(token);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <p className="text-sm text-muted mb-4">{t('link.signInHint')}</p>
      {error && <Alert>{t('login.invalidCredentials')}</Alert>}
      <label htmlFor="link-user" className="block text-sm text-muted mb-1">{t('login.username')}</label>
      <input id="link-user" value={username} onChange={(e) => setUsername(e.target.value)} className={`${input} mb-4`} autoComplete="username" autoFocus />
      <label htmlFor="link-password" className="block text-sm text-muted mb-1">{t('login.password')}</label>
      <input
        id="link-password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={`${input} mb-6`}
        autoComplete="current-password"
      />
      <button type="submit" className={primary} disabled={busy || !username || !password}>
        {busy ? t('login.signingIn') : t('login.signIn')}
      </button>
    </form>
  );
}

function ExternalSignIn({ signInUrl, onRetry }: { signInUrl: string | null; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <>
      <p className="text-sm text-muted mb-4">{t('login.externalHint')}</p>
      {signInUrl ? (
        <a href={signInUrl} className={`block mb-3 text-center break-all ${primary}`}>{t('login.signInAt', { url: signInUrl })}</a>
      ) : (
        <p className="mb-4 p-3 rounded-lg bg-control border border-border text-sm text-text">{t('login.signInThroughHost')}</p>
      )}
      <button type="button" className={secondary} onClick={onRetry}>{t('login.retry')}</button>
    </>
  );
}

function Review({ request, onDecide }: { request: LinkRequestView; onDecide: (d: 'approve' | 'deny') => void }) {
  const { t } = useI18n();
  const rows: [string, ReactNode][] = [
    [t('link.device'), request.client],
    [t('link.origin'), request.origin ?? '—'],
    [t('link.address'), request.remoteAddress ?? '—'],
    [
      t('link.permissions'),
      request.permissions ? (
        <span className="flex flex-wrap gap-1">
          {request.permissions.map((p) => (
            <code key={p} className="px-1.5 py-0.5 rounded bg-control text-xs">{p}</code>
          ))}
        </span>
      ) : (
        t('link.allPermissions')
      ),
    ],
  ];
  return (
    <>
      <h2 className="text-lg font-semibold text-heading mb-2">{t('link.title')}</h2>
      <p className="text-sm text-muted mb-4">{t('link.compareHint')}</p>
      <p className="mb-5 py-3 rounded-lg bg-control border border-border text-center font-mono text-2xl tracking-widest text-heading" aria-label={t('link.code')}>
        {request.userCode}
      </p>
      <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="text-text break-all">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted mb-4">{t('link.tokenHint')}</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button type="button" className={primary} onClick={() => onDecide('approve')}>{t('link.approve')}</button>
        <button type="button" className={secondary} onClick={() => onDecide('deny')}>{t('link.deny')}</button>
      </div>
    </>
  );
}
