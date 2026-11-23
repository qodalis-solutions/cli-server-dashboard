import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cliHasPermission } from '@qodalis/cli-core';
import type { DashboardExtensionInfo } from '@qodalis/cli-server-dashboard-kit';
import { getCurrentSession, getDashboardExtensions, type ExtensionUser } from '../api/extensions';
import { useAuth } from './AuthContext';

interface ExtensionsState {
  /** The extensions the signed-in user may open (their `permission`, when set, is held). */
  extensions: DashboardExtensionInfo[];
  loading: boolean;
  /** The signed-in user; on servers without sessions, the dashboard account's name. */
  user: ExtensionUser;
  /** The signed-in user's permissions; `['*']` on servers that do not report them (one admin account). */
  permissions: string[];
  /** Wildcard-aware (`users:*`, `*`), as the server matches them. */
  hasPermission: (permission: string) => boolean;
}

const EMPTY: ExtensionsState = {
  extensions: [],
  loading: false,
  user: { id: '', name: '' },
  permissions: [],
  hasPermission: () => false,
};

const ExtensionsContext = createContext<ExtensionsState | null>(null);

/** The extensions a user may open, in the server's order. */
export function visibleExtensions(extensions: readonly DashboardExtensionInfo[], permissions: readonly string[]): DashboardExtensionInfo[] {
  return extensions.filter(e => !e.permission || cliHasPermission(permissions, e.permission));
}

/**
 * Loads the server's dashboard extensions and the user's session once per sign-in. Either failing leaves the
 * dashboard as it is: no extensions, or (no session) the admin account of a server without the users plugin, which
 * holds every permission. The server checks permissions again on every request: this only hides pages.
 */
export function ExtensionsProvider({ children }: { children: ReactNode }) {
  const username = useAuth().user?.username ?? '';
  const [all, setAll] = useState<DashboardExtensionInfo[]>([]);
  const [session, setSession] = useState<{ user: ExtensionUser; permissions: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([getDashboardExtensions(), getCurrentSession()]).then(([extensions, current]) => {
      if (cancelled) return;
      setAll(extensions.status === 'fulfilled' ? extensions.value : []);
      setSession(current.status === 'fulfilled' ? current.value : null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const permissions = useMemo(() => session?.permissions ?? ['*'], [session]);
  const user = useMemo(() => session?.user ?? { id: username, name: username }, [session, username]);
  const hasPermission = useCallback((permission: string) => cliHasPermission(permissions, permission), [permissions]);
  const value = useMemo(
    () => ({ extensions: visibleExtensions(all, permissions), loading, user, permissions, hasPermission }),
    [all, permissions, loading, user, hasPermission],
  );
  return <ExtensionsContext.Provider value={value}>{children}</ExtensionsContext.Provider>;
}

/** The extensions state; outside an ExtensionsProvider (tests of single components): none. */
export function useExtensions(): ExtensionsState {
  return useContext(ExtensionsContext) ?? EMPTY;
}
