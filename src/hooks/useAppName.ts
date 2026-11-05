import { getBranding } from '../branding';
import { useI18n } from '../i18n';

/** The dashboard's name: the server's branding, or the default (`nav.appName`). */
export function useAppName(): string {
  const { t } = useI18n();
  return getBranding().name ?? t('nav.appName');
}
