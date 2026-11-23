import { useMemo } from 'react';
import { useFeatures } from '../context/FeaturesContext';
import { useExtensions } from '../context/ExtensionsContext';
import { useI18n } from '../i18n';
import { navItems, withExtensions, type NavItem } from '../components/navItems';

/**
 * The navigation items the server offers (while its features load, only those every server has), with the
 * extensions the user may open.
 */
export function useVisibleNavItems(): NavItem[] {
  const { hasFeature, loading } = useFeatures();
  const { extensions } = useExtensions();
  const { locale } = useI18n();
  return useMemo(() => {
    const own = loading
      ? navItems.filter(item => !item.feature)
      : navItems.filter(item => !item.feature || hasFeature(item.feature));
    return withExtensions(own, extensions, locale);
  }, [loading, hasFeature, extensions, locale]);
}
