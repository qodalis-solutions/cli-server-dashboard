import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cliHasPermission } from '@qodalis/cli-core';
import type { DashboardExtensionInfo } from '@qodalis/cli-server-dashboard-kit';
import { getCurrentSession, getDashboardExtensions, type ExtensionUser } from '../api/extensions';
import { useAuth } from './AuthContext';
import { useOptionalWebSocket } from './WebSocketContext';
import { EXTENSIONS_CHANGED_EVENT } from '../api/marketplace';

interface ExtensionsState {
  /** The extensions the signed-in user may open (their `permission`, when set, is held). */
  extensions: DashboardExtensionInfo[];
  loading: boolean;
  /** The signed-in user; on servers without sessions, the dashboard account's name. */
  user: ExtensionUser;
  /**
   * The signed-in user's permissions; `['*']` on servers without sessions (one admin account), none when the session
   * could not be read (fail closed: no plugin pages rather than pages whose requests all fail).
   */
  permissions: string[];
  /** Wildcard-aware (`users:*`, `*`), as the server matches them. */
  hasPermission: (permission: string) => boolean;
  /** Loads the extensions again without the loading state (a plugin was installed, updated or removed). */
  reload: () => void;
}

const EMPTY: ExtensionsState = {
  extensions: [],
  loading: false,
  user: { id: '', name: '' },
  permissions: [],
  hasPermission: () => false,
  reload: () => {},
};

const ExtensionsContext = createContext<ExtensionsState | null>(null);

/** The extensions a user may open, in the server's order. */
export function visibleExtensions(extensions: readonly DashboardExtensionInfo[], permissions: readonly string[]): DashboardExtensionInfo[] {
  return extensions.filter(e => !e.permission || cliHasPermission(permissions, e.permission));
}

/**
 * Loads the server's dashboard extensions and the user's session once per sign-in, and the extensions again on
 * `dashboard:extensions-changed` (a marketplace plugin installed, updated or removed): its page appears in or leaves
 * the navigation without a page reload. Failing extensions leave none; a server without sessions is the admin
 * account of a server without the users plugin, which holds every permission; a session that could not be read
 * holds none. The server checks permissions again on every request: this only hides pages.
 */
export function ExtensionsProvider({ children }: { children: ReactNode }) {
  const username = useAuth().user?.username ?? '';
  const [all, setAll] = useState<DashboardExtensionInfo[]>([]);
  // undefined: the session could not be read; null: the server has no sessions
  const [session, setSession] = useState<{ user: ExtensionUser; permissions: string[] } | null | undefined>(null);
  const [loading, setLoading] = useState(true);
  // Only the latest reload may replace the list
  const reloads = useRef(0);

  const reload = useCallback(() => {
    const request = ++reloads.current;
    getDashboardExtensions().then(
      list => { if (request === reloads.current) setAll(list); },
      () => { /* the pages stay as they are until the next change */ },
    );
  }, []);

  const subscribe = useOptionalWebSocket()?.subscribe;
  useEffect(() => subscribe?.(EXTENSIONS_CHANGED_EVENT, reload), [subscribe, reload]);

  useEffect(() => {
    let cancelled = false;
    const request = ++reloads.current;
    Promise.allSettled([getDashboardExtensions(), getCurrentSession()]).then(([extensions, current]) => {
      if (cancelled) return;
      // A live reload that started meanwhile has the newer list
      if (request === reloads.current) setAll(extensions.status === 'fulfilled' ? extensions.value : []);
      setSession(current.status === 'fulfilled' ? current.value : undefined);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const permissions = useMemo(() => (session === undefined ? [] : (session?.permissions ?? ['*'])), [session]);
  const user = useMemo(() => session?.user ?? { id: username, name: username }, [session, username]);
  const hasPermission = useCallback((permission: string) => cliHasPermission(permissions, permission), [permissions]);
  const value = useMemo(
    () => ({ extensions: visibleExtensions(all, permissions), loading, user, permissions, hasPermission, reload }),
    [all, permissions, loading, user, hasPermission, reload],
  );
  return <ExtensionsContext.Provider value={value}>{children}</ExtensionsContext.Provider>;
}

/** The extensions state; outside an ExtensionsProvider (tests of single components): none. */
export function useExtensions(): ExtensionsState {
  return useContext(ExtensionsContext) ?? EMPTY;
}
