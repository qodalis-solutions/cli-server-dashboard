import { useMemo } from 'react';
import { useExtensions } from '../context/ExtensionsContext';
import { useI18n } from '../i18n';
import { navItems, withExtensions, type NavItem } from '../components/navItems';

/** The dashboard's own pages with the extensions the user may open (plugins' pages, e.g. jobs, audit). */
export function useVisibleNavItems(): NavItem[] {
  const { extensions } = useExtensions();
  const { locale } = useI18n();
  return useMemo(() => withExtensions(navItems, extensions, locale), [extensions, locale]);
}
