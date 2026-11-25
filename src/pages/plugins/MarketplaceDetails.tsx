import { useCallback } from 'react';
import { Badge, ChipList, ErrorState, Modal, Spinner, formatBytes } from '@qodalis/cli-server-dashboard-kit';
import { getMarketplacePlugin } from '../../api/marketplace';
import { useApi } from '../../hooks/useApi';
import { useI18n } from '../../i18n';
import type { MarketplacePluginItem } from '../../types';
import ModuleIconView from './ModuleIconView';
import { readmeExcerpt, useMarketplaceErrorText } from './marketplaceText';

const CHIP = 'font-mono text-[11px] text-muted bg-control border border-border/75 px-1.5 py-0.5 rounded';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">{title}</h3>
      {children}
    </section>
  );
}

/**
 * A marketplace plugin's details in a dialog: publisher, readme excerpt, versions, the files of the latest version
 * with their sizes, the server packages it pairs with.
 */
export default function MarketplaceDetails({ plugin, onClose }: { plugin: MarketplacePluginItem; onClose: () => void }) {
  const { t, formatNumber } = useI18n();
  const reason = useMarketplaceErrorText();
  const fetcher = useCallback(() => getMarketplacePlugin(plugin.name), [plugin.name]);
  const { data, loading, error, refetch } = useApi(fetcher, [fetcher]);
  const latest = data?.versions.find(v => v.version === data.latest) ?? data?.versions[0];

  return (
    <Modal open onClose={onClose} size="lg" title={plugin.title} description={plugin.name}>
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3">
          <ModuleIconView icon={plugin.icon} names={[plugin.name]} />
          <div className="min-w-0 space-y-1">
            <PublisherLine plugin={plugin} />
            <p className="text-muted">{plugin.description}</p>
          </div>
        </div>

        {loading && !data && <Spinner label={t('marketplace.loadingDetails')} />}
        {error && <ErrorState title={t('marketplace.detailsFailed')} error={reason(new Error(error))} onRetry={refetch} compact />}

        {data && (
          <>
            <Section title={t('marketplace.versions')}>
              <ChipList
                items={data.versions.map(v => ({ label: `v${v.version}`, key: v.version, title: v.deprecated }))}
                max={6}
                title={t('marketplace.versionsOf', { title: plugin.title })}
                label={t('marketplace.versions')}
                chipClassName={CHIP}
                empty={t('marketplace.none')}
              />
            </Section>
            <Section title={latest ? t('marketplace.filesOf', { version: latest.version }) : t('marketplace.files')}>
              <ChipList
                items={(latest?.files ?? []).map(f => ({
                  label: f.size === undefined ? f.path : `${f.path} · ${formatBytes(f.size, formatNumber)}`,
                  key: f.path,
                  title: f.integrity,
                }))}
                max={4}
                title={latest ? t('marketplace.filesOf', { version: latest.version }) : t('marketplace.files')}
                label={t('marketplace.files')}
                chipClassName={CHIP}
                empty={t('marketplace.none')}
              />
            </Section>
            <Section title={t('marketplace.serverPackages')}>
              <ChipList
                items={data.serverPackages.map(p => ({ label: p.platform ? `${p.platform}: ${p.name}` : p.name, key: `${p.platform}:${p.name}` }))}
                max={3}
                title={t('marketplace.serverPackages')}
                label={t('marketplace.serverPackages')}
                chipClassName={CHIP}
                empty={t('marketplace.none')}
              />
            </Section>
            <Section title={t('marketplace.readme')}>
              {data.readme.trim()
                ? <pre data-testid="readme" className="whitespace-pre-wrap break-words font-sans text-xs text-text bg-control/40 border border-border rounded-lg p-3 max-h-72 overflow-y-auto">{readmeExcerpt(data.readme)}</pre>
                : <p className="text-xs text-subtle">{t('marketplace.noReadme')}</p>}
            </Section>
          </>
        )}
      </div>
    </Modal>
  );
}

/** "by <publisher>" with the verified badge, or the unverified mark. */
export function PublisherLine({ plugin }: { plugin: MarketplacePluginItem }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-xs text-subtle">
      <span>{t('marketplace.byPublisher', { publisher: plugin.publisher.name || '—' })}</span>
      {plugin.publisher.verified
        ? <Badge variant="success">✓ {t('marketplace.verified')}</Badge>
        : <span className="sr-only">{t('marketplace.unverified')}</span>}
    </div>
  );
}
