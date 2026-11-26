import { useMemo } from 'react';
import { useExtensions } from '../context/ExtensionsContext';
import { useI18n } from '../i18n';
import { navItems, permittedNavItems, withExtensions, type NavItem } from '../components/navItems';

/**
 * The dashboard's own pages the user may open (their `permission`, when set, is held; on a server without sessions
 * every one) with the extensions the user may open (plugins' pages, e.g. jobs, audit).
 */
export function useVisibleNavItems(): NavItem[] {
  const { extensions, permissions, loading } = useExtensions();
  const { locale } = useI18n();
  return useMemo(
    // Until the session is read, only the pages everyone may open: a gated link appears rather than vanishes
    () => withExtensions(permittedNavItems(navItems, loading ? [] : permissions), extensions, locale),
    [extensions, permissions, loading, locale],
  );
}
