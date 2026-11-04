import type { ReactNode } from 'react';
import { useFeatures } from '../context/FeaturesContext';
import { useI18n, type MessageKey } from '../i18n';
import PageHeader from './PageHeader';

/**
 * Renders a page only when the server provides its feature. The sidebar hides such pages;
 * a direct link (bookmark, typed URL) shows "Not enabled on this server" instead of a page
 * whose requests would all fail.
 */
export default function FeatureGate({ feature, title, children }: { feature: string; title: MessageKey; children: ReactNode }) {
  const { hasFeature, loading } = useFeatures();
  const { t } = useI18n();

  if (loading) return <div className="p-6 text-muted">{t('common.loading')}</div>;
  if (hasFeature(feature)) return <>{children}</>;

  return (
    <div>
      <PageHeader title={t(title)} />
      <div className="p-6">
        <div role="status" className="max-w-lg p-4 rounded-lg bg-surface border border-border">
          <div className="text-heading font-medium mb-1">{t('nav.notEnabled')}</div>
          <div className="text-sm text-muted">{t('nav.notEnabledHint')}</div>
        </div>
      </div>
    </div>
  );
}
