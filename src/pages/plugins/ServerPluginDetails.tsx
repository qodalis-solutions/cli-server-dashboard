import { useCallback, useEffect, useState } from 'react';
import { Badge, ChipList, ErrorState, Modal, Spinner } from '@qodalis/cli-server-dashboard-kit';
import { SERVER_PLATFORMS, getServerPlugin, installCommand } from '../../api/serverMarketplace';
import { useApi } from '../../hooks/useApi';
import { useI18n } from '../../i18n';
import type { ServerPlatform, ServerPluginItem } from '../../types';
import { PublisherLine, Section, SettingsTable } from './MarketplaceDetails';
import ModuleIconView from './ModuleIconView';
import { readmeExcerpt } from './marketplaceText';
import { platformLabel, useServerPluginErrorText } from './serverPluginText';
import { SetupNote } from './ServerPluginParts';

const CHIP = 'font-mono text-[11px] text-muted bg-control border border-border/75 px-1.5 py-0.5 rounded';
const CELL = 'px-2 py-1.5 align-top';

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
 * A server plugin's details in a dialog: each platform's package with its versions (this server's marked), the install
 * command of each platform with a copy button, the settings the plugin declares, and the start of its readme.
 */
export default function ServerPluginDetails({ plugin, platform, marketplaceUrl, onClose }: {
  plugin: ServerPluginItem;
  /** This server's platform. */
  platform: ServerPlatform | null;
  marketplaceUrl: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const reason = useServerPluginErrorText(platform);
  const fetcher = useCallback(() => getServerPlugin(plugin.name), [plugin.name]);
  const { data, loading, error, refetch } = useApi(fetcher, [fetcher]);
  const shown = data ?? plugin;
  const platforms = SERVER_PLATFORMS.filter(p => shown.platforms[p]);

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
        {!shown.autoInstall && <SetupNote plugin={shown} marketplaceUrl={marketplaceUrl} />}

        {loading && !data && <Spinner label={t('marketplace.loadingDetails')} />}
        {error && <ErrorState title={t('marketplace.detailsFailed')} error={reason(new Error(error))} onRetry={refetch} compact />}

        {data && (
          <>
            <Section title={t('serverMarketplace.versionsPerPlatform')}>
              {platforms.length === 0 ? <p className="text-xs text-subtle">{t('marketplace.none')}</p> : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-border/50">
                      {platforms.map(p => {
                        const versions = data.versions.filter(v => v.platform === p);
                        return (
                          <tr key={p} data-platform={p}>
                            <th scope="row" className={`${CELL} text-left font-normal whitespace-nowrap`}>
                              <div className="flex items-center gap-1.5">
                                <span className="text-text font-medium">{platformLabel(p)}</span>
                                {p === platform && <Badge variant="info">{t('serverMarketplace.thisServer')}</Badge>}
                              </div>
                              <div className="font-mono text-subtle break-all">{data.platforms[p]?.package}</div>
                            </th>
                            <td className={CELL}>
                              <ChipList
                                items={versions.length > 0
                                  ? versions.map(v => ({ label: `v${v.version}`, key: v.version, title: v.serverRange ? t('serverMarketplace.needsServer', { range: v.serverRange }) : undefined }))
                                  : data.platforms[p]?.latest ? [{ label: `v${data.platforms[p]?.latest}`, key: 'latest' }] : []}
                                max={5}
                                title={t('serverMarketplace.versionsOf', { platform: platformLabel(p) })}
                                label={t('serverMarketplace.versionsOf', { platform: platformLabel(p) })}
                                chipClassName={CHIP}
                                empty={t('marketplace.none')}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
            {platforms.length > 0 && (
              <Section title={t('serverMarketplace.installCommands')}>
                <ul className="space-y-1.5">
                  {platforms.map(p => {
                    const pkg = data.platforms[p]!;
                    return <CopyCommand key={p} platform={p} command={pkg.install || installCommand(p, pkg.package)} />;
                  })}
                </ul>
              </Section>
            )}
            {data.config && (
              <Section title={t('marketplace.settings')}>
                <SettingsTable entries={data.config.entries} />
              </Section>
            )}
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
