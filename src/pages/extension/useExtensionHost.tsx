import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { DashboardExtensionContext, DashboardExtensionInfo, DashboardTheme } from '@qodalis/cli-server-dashboard-kit';
import { useConfirm } from '../../components/useConfirm';
import { extensionPath } from '../../components/navItems';
import { useExtensions } from '../../context/ExtensionsContext';
import { useOptionalWebSocket } from '../../context/WebSocketContext';
import { useI18n } from '../../i18n';
import { DASHBOARD_PLUGINS_PROVIDER } from '../../api/marketplace';
import { extensionTitle } from '../../components/navItems';
import { apiBase, extensionFetch } from './extensionFetch';
import { createExtensionConfig, isMarketplaceExtension } from './extensionConfig';
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

const NO_EVENTS = () => () => {};

/**
 * The context the dashboard gives an extension (docs/extensions.md), for its page or one of its Overview cards:
 * `path` is the extension's own path (always `/` for a card), `navigate` opens a path below its page. Returns the
 * context, built once per extension, what has to be rendered with it (the confirm dialog, the notices), and `ready`:
 * awaited before mounting, it reads a marketplace extension's settings (`ctx.config`; a failed read mounts it with
 * `{}` and a notice), which then follow `config:changed` of its section live (`onConfigChange`). Built-in extensions
 * get `config: undefined` at once.
 */
export function useExtensionHost(extension: DashboardExtensionInfo, path: string): {
  context: DashboardExtensionContext;
  overlays: ReactNode;
  ready: () => Promise<void>;
} {
  const { t, locale } = useI18n();
  const { user, permissions, hasPermission } = useExtensions();
  const navigateTo = useNavigate();
  const theme = useDocumentTheme();
  const { confirm, dialog } = useConfirm();
  const events = useOptionalWebSocket();
  const subscribeEvents = events?.subscribe ?? NO_EVENTS;
  const [notices, setNotices] = useState<Notice[]>([]);

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

  // Everything else the context needs; the context object itself is built once per extension
  const configFailed = t('extensions.configFailed', { title: extensionTitle(extension, locale) });
  const deps = useRef({ user, permissions, hasPermission, navigateTo, confirm, notify, subscribeEvents, configFailed });
  useLayoutEffect(() => {
    live.current = { theme, language: locale, path };
    deps.current = { user, permissions, hasPermission, navigateTo, confirm, notify, subscribeEvents, configFailed };
  });

  // A marketplace extension's settings, read before it mounts and again on each change of its section
  // A failed read is counted and told in an effect (a notice in the reader's language)
  const [configFailures, setConfigFailures] = useState(0);
  const config = useMemo(() => createExtensionConfig(extension, () => setConfigFailures(n => n + 1)), [extension]);
  useEffect(() => {
    if (configFailures > 0) deps.current.notify(deps.current.configFailed, 'error');
  }, [configFailures]);
  useEffect(() => {
    if (!isMarketplaceExtension(extension)) return;
    return subscribeEvents('config:changed', event => {
      if (event.provider === DASHBOARD_PLUGINS_PROVIDER && event.section === extension.id) void config.reload();
    });
  }, [extension, config, subscribeEvents]);

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
      get config() { return config.values; },
      onConfigChange: listener => config.subscribe(listener),
      onServerEvent: (pattern, listener) => deps.current.subscribeEvents(String(pattern), event => listener(event)),
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
  }, [extension, listeners, config]);

  const overlays = (
    <>
      {dialog}
      <div aria-live="polite" aria-label={t('extensions.notifications')} className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {notices.map(notice => (
          <div key={notice.id} className={`rounded-lg border bg-popover px-4 py-2 text-sm shadow-lg ${NOTICE_STYLES[notice.kind]}`}>
            {notice.message}
          </div>
        ))}
      </div>
    </>
  );
  return { context, overlays, ready: config.ready };
}
