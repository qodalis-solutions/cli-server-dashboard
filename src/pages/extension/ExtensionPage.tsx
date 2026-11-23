import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import type { DashboardExtensionInfo } from '@qodalis/cli-server-dashboard-kit';
import ErrorBoundary from '../../components/ErrorBoundary';
import { extensionPath, extensionTitle } from '../../components/navItems';
import { useExtensions } from '../../context/ExtensionsContext';
import { useI18n } from '../../i18n';
import { injectStyles, loadExtension } from './loadExtension';
import { useExtensionHost } from './useExtensionHost';

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
  const location = useLocation();
  const title = extensionTitle(extension, locale);
  const path = innerPath(location.pathname, location.search, location.hash, extension.id);
  const { context, overlays } = useExtensionHost(extension, path);

  const element = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ status: 'loading' | 'ready' } | { status: 'error'; error: string }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

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
      {overlays}
    </>
  );
}
