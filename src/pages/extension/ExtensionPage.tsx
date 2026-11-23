import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import type { DashboardExtensionContext, DashboardExtensionInfo, DashboardTheme } from '@qodalis/cli-server-dashboard-kit';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useConfirm } from '../../components/useConfirm';
import { extensionPath, extensionTitle } from '../../components/navItems';
import { useExtensions } from '../../context/ExtensionsContext';
import { useI18n } from '../../i18n';
import { apiBase, extensionFetch } from './extensionFetch';
import { injectStyles, loadExtension } from './loadExtension';
import { useDocumentTheme } from './useDocumentTheme';

interface Listeners {
  theme: Set<(theme: DashboardTheme) => void>;
  language: Set<(language: string) => void>;
  path: Set<(path: string) => void>;
}
type Listener<K extends keyof Listeners> = Listeners[K] extends Set<infer F> ? F : never;

type Notice = { id: number; message: string; kind: 'success' | 'error' | 'info' };

const NOTICE_STYLES: Record<Notice['kind'], string> = {
  success: 'border-success/40 text-success',
  error: 'border-error/40 text-error',
  info: 'border-info/40 text-info',
};

/** A page a plugin adds (`/x/<id>/*`, docs/extensions.md): loads its module and mounts it. */
export default function ExtensionPage() {
  const { id = '' } = useParams();
  const { extensions, loading } = useExtensions();
  const { t, locale } = useI18n();
  const extension = extensions.find(e => e.id === id);

  if (loading) {
    return <div className="py-16 text-center text-muted">{t('common.loading')}</div>;
  }
  if (!extension) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-lg font-semibold text-heading">{t('extensions.notFound')}</h1>
        <p className="mt-2 text-sm text-muted">{t('extensions.notFoundHint')}</p>
      </div>
    );
  }
  return (
    <ErrorBoundary variant="page" label={extensionTitle(extension, locale)} resetKeys={[extension.id]}>
      <ExtensionHost key={extension.id} extension={extension} />
    </ErrorBoundary>
  );
}

/** The extension's own path below `/x/<id>`, with its query and hash: `/`, `/plugins/abc?tab=log`. */
function innerPath(pathname: string, search: string, hash: string, id: string): string {
  const rest = pathname.slice(extensionPath(id).length);
  return `${rest.startsWith('/') ? rest : `/${rest}`}${search}${hash}`;
}

function ExtensionHost({ extension }: { extension: DashboardExtensionInfo }) {
  const { t, locale } = useI18n();
  const { user, permissions, hasPermission } = useExtensions();
  const location = useLocation();
  const navigateTo = useNavigate();
  const theme = useDocumentTheme();
  const { confirm, dialog } = useConfirm();
  const title = extensionTitle(extension, locale);

  const element = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ status: 'loading' | 'ready' } | { status: 'error'; error: string }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [notices, setNotices] = useState<Notice[]>([]);

  const path = innerPath(location.pathname, location.search, location.hash, extension.id);

  // What the extension reads live (getters on the context), updated after every render
  const live = useRef({ theme, language: locale as string, path });
  const [listeners] = useState<Listeners>(() => ({ theme: new Set(), language: new Set(), path: new Set() }));
  useEffect(() => listeners.theme.forEach(fn => fn(theme)), [listeners, theme]);
  useEffect(() => listeners.language.forEach(fn => fn(locale)), [listeners, locale]);
  useEffect(() => listeners.path.forEach(fn => fn(path)), [listeners, path]);

  const notify = useCallback((message: string, kind: Notice['kind'] = 'info') => {
    const notice = { id: Date.now() + Math.random(), message: String(message), kind };
    setNotices(list => [...list.slice(-2), notice]);
    setTimeout(() => setNotices(list => list.filter(n => n.id !== notice.id)), 5000);
  }, []);

  // Everything else the context needs; the context object itself is built once per mount
  const deps = useRef({ user, permissions, hasPermission, navigateTo, confirm, notify });
  useLayoutEffect(() => {
    live.current = { theme, language: locale, path };
    deps.current = { user, permissions, hasPermission, navigateTo, confirm, notify };
  });

  const context = useMemo((): DashboardExtensionContext => {
    const subscribe = <K extends keyof Listeners>(kind: K) =>
      (listener: Listener<K>) => {
        const set = listeners[kind] as Set<Listener<K>>;
        set.add(listener);
        return () => void set.delete(listener);
      };
    return {
      extension,
      apiBase: apiBase(),
      fetch: extensionFetch,
      get user() { return deps.current.user; },
      get permissions() { return [...deps.current.permissions]; },
      hasPermission: permission => deps.current.hasPermission(permission),
      get theme() { return live.current.theme; },
      onThemeChange: subscribe('theme'),
      get language() { return live.current.language; },
      onLanguageChange: subscribe('language'),
      get path() { return live.current.path; },
      navigate: (to, options) =>
        deps.current.navigateTo(`${extensionPath(extension.id)}${to.startsWith('/') ? to : `/${to}`}`, { replace: options?.replace }),
      onPathChange: subscribe('path'),
      notify: (message, kind) => deps.current.notify(message, kind),
      confirm: options =>
        deps.current.confirm({
          title: options.title,
          message: options.message ?? '',
          confirmLabel: options.confirmText,
          tone: options.danger ? 'danger' : 'default',
        }),
      dashboardVersion: __DASHBOARD_VERSION__,
      apiVersion: 1,
    };
  }, [extension, listeners]);

  useEffect(() => {
    const host = element.current;
    if (!host) return;
    let cancelled = false;
    let cleanup: void | (() => void);
    const target = document.createElement('div');
    host.appendChild(target);
    setState({ status: 'loading' });
    (async () => {
      try {
        injectStyles(extension.styles);
        const module = await loadExtension(extension.entry, attempt);
        if (cancelled) return;
        cleanup = await module.mount(target, context);
        if (cancelled) {
          cleanup?.();
          return;
        }
        setState({ status: 'ready' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => {
      cancelled = true;
      try {
        cleanup?.();
      } catch {
        // a failing cleanup must not keep the dashboard from leaving the page
      }
      target.remove();
    };
  }, [extension, context, attempt]);

  return (
    <>
      {state.status === 'loading' && (
        <div className="py-16 text-center text-muted">{t('extensions.loading', { title })}</div>
      )}
      {state.status === 'error' && (
        <div role="alert" className="mx-auto max-w-xl my-12 rounded-xl border border-error/30 bg-error/10 p-6 text-center">
          <h1 className="text-lg font-semibold text-heading">{t('extensions.failed', { title })}</h1>
          <p className="mt-2 text-sm text-muted">{t('extensions.failedHint')}</p>
          <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-xs text-error">{state.error}</pre>
          {extension.version && (
            <p className="mt-2 text-xs text-subtle">{t('extensions.version', { version: extension.version })}</p>
          )}
          <button
            type="button"
            onClick={() => setAttempt(n => n + 1)}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm hover:bg-primary/90"
          >
            {t('common.retry')}
          </button>
        </div>
      )}
      <div ref={element} hidden={state.status === 'error'} data-extension={extension.id} />
      {dialog}
      <div
        aria-live="polite"
        aria-label={t('extensions.notifications')}
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      >
        {notices.map(notice => (
          <div key={notice.id} className={`rounded-lg border bg-surface px-4 py-2 text-sm shadow-lg ${NOTICE_STYLES[notice.kind]}`}>
            {notice.message}
          </div>
        ))}
      </div>
    </>
  );
}
