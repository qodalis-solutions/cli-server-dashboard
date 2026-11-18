import { useFeatures } from '../context/FeaturesContext';
import { navItems, type NavItem } from '../components/navItems';

/** The navigation items the server offers (while its features load, only those every server has). */
export function useVisibleNavItems(): NavItem[] {
  const { hasFeature, loading } = useFeatures();
  return loading
    ? navItems.filter(item => !item.feature)
    : navItems.filter(item => !item.feature || hasFeature(item.feature));
}
