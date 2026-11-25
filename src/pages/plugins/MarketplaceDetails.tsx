import { useCallback } from 'react';
import { Badge, ChipList, ErrorState, Modal, Spinner, formatBytes } from '@qodalis/cli-server-dashboard-kit';
import { getMarketplacePlugin, versionConfig } from '../../api/marketplace';
import { useApi } from '../../hooks/useApi';
import { useI18n } from '../../i18n';
import type { MarketplaceConfigEntry, MarketplacePluginItem } from '../../types';
import { displayValue } from '../config/configValue';
import { ruleParts } from './pluginSettings';
import ModuleIconView from './ModuleIconView';
import { readmeExcerpt, useMarketplaceErrorText } from './marketplaceText';

const CHIP = 'font-mono text-[11px] text-muted bg-control border border-border/75 px-1.5 py-0.5 rounded';

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">{title}</h3>
      {children}
    </section>
  );
}

const CELL = 'px-2 py-1.5 align-top';

/** The settings a version declares: key (and label), type, default and rule. */
export function SettingsTable({ entries }: { entries: MarketplaceConfigEntry[] }) {
  const { t } = useI18n();
  if (entries.length === 0) return <p className="text-xs text-subtle">{t('marketplace.noSettings')}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="bg-control/40 text-left text-subtle">
          <tr>
            <th scope="col" className={`${CELL} font-medium`}>{t('marketplace.colKey')}</th>
            <th scope="col" className={`${CELL} font-medium`}>{t('marketplace.colType')}</th>
            <th scope="col" className={`${CELL} font-medium`}>{t('marketplace.colDefault')}</th>
            <th scope="col" className={`${CELL} font-medium`}>{t('marketplace.colRule')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {entries.map(entry => {
            const rules = ruleParts(entry, t);
            return (
              <tr key={entry.key} data-setting={entry.key}>
                <th scope="row" className={`${CELL} text-left font-normal`}>
                  <div className="font-mono text-text break-all">{entry.key}</div>
                  {entry.label && entry.label !== entry.key && <div className="text-subtle">{entry.label}</div>}
                  {entry.description && <div className="text-subtle">{entry.description}</div>}
                </th>
                <td className={`${CELL} font-mono text-muted whitespace-nowrap`}>{entry.type}</td>
                <td className={`${CELL} font-mono text-text break-all`}>{displayValue(entry.default)}</td>
                <td className={`${CELL} text-muted`}>{rules.length ? rules.join(' · ') : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A marketplace plugin's details in a dialog: publisher, readme excerpt, versions, the files of the latest version
 * with their sizes, its settings, the server packages it pairs with.
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
            <Section title={t('marketplace.settings')}>
              <SettingsTable entries={versionConfig(data)} />
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
export function PublisherLine({ plugin }: { plugin: Pick<MarketplacePluginItem, 'publisher'> }) {
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
