import { useCallback, useEffect, useState } from 'react';
import { ChipList, ErrorState, Modal, Spinner } from '@qodalis/cli-server-dashboard-kit';
import { SERVER_PLATFORMS, getServerPlugin, installCommand } from '../../api/serverMarketplace';
import { useApi } from '../../hooks/useApi';
import { useI18n } from '../../i18n';
import type { ServerPlatform, ServerPluginItem } from '../../types';
import { PublisherLine, Section, SettingsTable } from './MarketplaceDetails';
import ModuleIconView from './ModuleIconView';
import { BADGE_ROW, InstallStateBadges } from './InstallState';
import { addedInCode } from './installSource';
import { readmeExcerpt } from './marketplaceText';
import { platformLabel, useServerPluginErrorText } from './serverPluginText';
import { SetupNote } from './ServerPluginParts';

const CHIP = 'font-mono text-[11px] text-muted bg-control border border-border/75 px-1.5 py-0.5 rounded';

/** A command with a copy button that says "Copied" for a moment. */
function CopyCommand({ platform, command }: { platform: ServerPlatform; command: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // Clipboard refused (insecure context or permission): the command stays selectable
    }
  }
  return (
    <li className="flex items-center gap-2" data-platform={platform}>
      <span className="w-14 shrink-0 text-xs text-subtle">{platformLabel(platform)}</span>
      <code className="flex-1 min-w-0 truncate font-mono text-xs text-text bg-control/60 border border-border rounded px-2 py-1" title={command}>{command}</code>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={t('serverMarketplace.copyCommand', { platform: platformLabel(platform) })}
        className="shrink-0 px-2 py-1 text-xs rounded-md bg-control hover:bg-control-hover text-text"
      >
        {copied ? t('serverMarketplace.copied') : t('serverMarketplace.copy')}
      </button>
    </li>
  );
}

/**
 * Node, Python and .NET as tabs: the platforms without a package disabled and marked, this server's marked; the
 * selected one's readme, versions and install command are shown.
 */
function PlatformSwitch({ selected, available, platform, onSelect }: {
  selected: ServerPlatform | null;
  available: ServerPlatform[];
  platform: ServerPlatform | null;
  onSelect: (platform: ServerPlatform) => void;
}) {
  const { t } = useI18n();
  return (
    <div role="tablist" aria-label={t('serverMarketplace.platformSwitch')} className="flex flex-wrap items-center gap-1.5">
      {SERVER_PLATFORMS.map(p => {
        const has = available.includes(p);
        const label = platformLabel(p);
        const text = !has
          ? t('serverMarketplace.platformTabMissing', { platform: label })
          : p === platform ? t('serverMarketplace.platformTabThisServer', { platform: label }) : label;
        const active = p === selected;
        const look = active
          ? 'border-primary bg-primary/15 text-heading font-semibold'
          : has ? 'border-border bg-control text-text hover:bg-control-hover' : 'border-border/50 text-subtle line-through opacity-60 cursor-not-allowed';
        return (
          <button
            key={p}
            type="button"
            role="tab"
            data-platform={p}
            aria-selected={active}
            aria-controls={active ? 'platform-panel' : undefined}
            aria-disabled={!has || undefined}
            disabled={!has}
            title={text}
            onClick={() => onSelect(p)}
            className={`px-2.5 py-1 rounded-md border text-xs inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${look}`}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A server plugin's details in a dialog: each platform's package with its versions (this server's marked), the install
 * command of each platform with a copy button, the settings the plugin declares, and the start of its readme.
 */
export default function ServerPluginDetails({ plugin, platform, initialPlatform, marketplaceUrl, onClose }: {
  plugin: ServerPluginItem;
  /** This server's platform. */
  platform: ServerPlatform | null;
  /** The tab to open on (the platform the list is filtered to); default this server's. */
  initialPlatform?: ServerPlatform | null;
  marketplaceUrl: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const reason = useServerPluginErrorText(platform);
  const fetcher = useCallback(() => getServerPlugin(plugin.name), [plugin.name]);
  const { data, loading, error, refetch } = useApi(fetcher, [fetcher]);
  const shown = data ?? plugin;
  const available = SERVER_PLATFORMS.filter(p => shown.platforms[p]);
  const [chosen, setChosen] = useState<ServerPlatform | null>(initialPlatform ?? null);
  // The chosen platform, else this server's when the plugin has it, else its first
  const selected = chosen && available.includes(chosen) ? chosen : platform && available.includes(platform) ? platform : available[0] ?? null;
  const selectedVersions = data && selected ? data.versions.filter(v => v.platform === selected) : [];
  // The platform's readme, else the plugin's, else its description
  const readme = data
    ? [selected ? data.platforms[selected]?.readme : undefined, data.readme, data.description].find(r => r && r.trim())?.trim() ?? ''
    : '';

  return (
    <Modal open onClose={onClose} size="lg" title={plugin.title} description={plugin.name}>
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3">
          <ModuleIconView icon={plugin.icon} names={[plugin.name]} />
          <div className="min-w-0 space-y-1">
            <PublisherLine plugin={plugin} />
            <p className="text-muted">{plugin.description}</p>
            {shown.installed && (
              <div className={BADGE_ROW} data-testid="install-state">
                <InstallStateBadges installed={shown.installed} updateAvailable={shown.updateAvailable} latest={shown.platform?.latest ?? null} />
              </div>
            )}
          </div>
        </div>
        {!shown.autoInstall && !addedInCode(shown.installed) && <SetupNote plugin={shown} marketplaceUrl={marketplaceUrl} />}

        {loading && !data && <Spinner label={t('marketplace.loadingDetails')} />}
        {error && <ErrorState title={t('marketplace.detailsFailed')} error={reason(new Error(error))} onRetry={refetch} compact />}

        {data && (
          <>
            {available.length === 0 ? <p className="text-xs text-subtle">{t('marketplace.none')}</p> : (
              <>
                <PlatformSwitch selected={selected} available={available} platform={platform} onSelect={setChosen} />
                {selected && (
                  <div id="platform-panel" role="tabpanel" aria-label={platformLabel(selected)} className="space-y-4">
                    {platform && (
                      <p data-testid="platform-note" className={`text-xs ${selected === platform ? 'text-info' : 'text-subtle'}`}>
                        {selected === platform
                          ? t('serverMarketplace.platformWouldInstall', { platform: platformLabel(platform) })
                          : available.includes(platform)
                            ? t('serverMarketplace.platformReference', { platform: platformLabel(platform), own: platformLabel(platform) })
                            : t('serverMarketplace.errUnavailable', { platform: platformLabel(platform) })}
                      </p>
                    )}
                    <Section title={t('serverMarketplace.versionsOf', { platform: platformLabel(selected) })}>
                      <div className="font-mono text-xs text-subtle break-all mb-1" data-testid="platform-package">{data.platforms[selected]?.package}</div>
                      <ChipList
                        items={selectedVersions.length > 0
                          ? selectedVersions.map(v => ({ label: `v${v.version}`, key: v.version, title: v.serverRange ? t('serverMarketplace.needsServer', { range: v.serverRange }) : undefined }))
                          : data.platforms[selected]?.latest ? [{ label: `v${data.platforms[selected]?.latest}`, key: 'latest' }] : []}
                        max={5}
                        title={t('serverMarketplace.versionsOf', { platform: platformLabel(selected) })}
                        label={t('serverMarketplace.versionsOf', { platform: platformLabel(selected) })}
                        chipClassName={CHIP}
                        empty={t('marketplace.none')}
                      />
                    </Section>
                    <Section title={t('serverMarketplace.installCommand')}>
                      <ul className="space-y-1.5">
                        <CopyCommand
                          platform={selected}
                          command={data.platforms[selected]!.install || installCommand(selected, data.platforms[selected]!.package)}
                        />
                      </ul>
                    </Section>
                  </div>
                )}
              </>
            )}
            {data.config && (
              <Section title={t('marketplace.settings')}>
                <SettingsTable entries={data.config.entries} />
              </Section>
            )}
            <Section title={selected ? t('serverMarketplace.readmeOf', { platform: platformLabel(selected) }) : t('marketplace.readme')}>
              {readme
                ? <pre data-testid="readme" className="whitespace-pre-wrap break-words font-sans text-xs text-text bg-control/40 border border-border rounded-lg p-3 max-h-72 overflow-y-auto">{readmeExcerpt(readme)}</pre>
                : <p className="text-xs text-subtle">{t('marketplace.noReadme')}</p>}
            </Section>
          </>
        )}
      </div>
    </Modal>
  );
}
