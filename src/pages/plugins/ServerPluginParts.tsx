import { SERVER_PLATFORMS } from '../../api/serverMarketplace';
import { useI18n } from '../../i18n';
import type { ServerPlatform, ServerPluginItem } from '../../types';
import { platformLabel, setupLink } from './serverPluginText';

/**
 * Node, Python and .NET: the platforms with a package plain, those without dimmed and struck through, this server's
 * highlighted (`aria-current`).
 */
export function PlatformBadges({ plugin, platform }: { plugin: ServerPluginItem; platform: ServerPlatform | null }) {
  const { t } = useI18n();
  return (
    <ul aria-label={t('serverMarketplace.platforms')} className="flex flex-wrap items-center gap-1.5">
      {SERVER_PLATFORMS.map(p => {
        const available = !!plugin.platforms[p] || (p === platform && !!plugin.platform);
        const own = p === platform;
        const label = platformLabel(p);
        const state = own
          ? t(available ? 'serverMarketplace.platformThisServer' : 'serverMarketplace.platformThisServerMissing', { platform: label })
          : t(available ? 'serverMarketplace.platformAvailable' : 'serverMarketplace.platformMissing', { platform: label });
        const look = own
          ? available ? 'border-primary bg-primary/15 text-heading font-semibold' : 'border-error/40 bg-error/10 text-error line-through'
          : available ? 'border-border bg-control text-text' : 'border-border/50 text-subtle line-through opacity-60';
        return (
          <li
            key={p}
            data-platform={p}
            data-available={available}
            aria-current={own ? 'true' : undefined}
            aria-label={state}
            title={state}
            className={`px-1.5 py-0.5 rounded border text-[11px] ${look}`}
          >
            {label}
          </li>
        );
      })}
    </ul>
  );
}

/** "Needs setup in code" with the plugin's reason and a link to its README or homepage. */
export function SetupNote({ plugin, marketplaceUrl }: { plugin: ServerPluginItem; marketplaceUrl: string }) {
  const { t } = useI18n();
  const href = setupLink(plugin, marketplaceUrl);
  return (
    <div role="note" data-testid="setup-note" className="rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2 text-xs space-y-0.5">
      <div className="font-medium text-warning">⚙ {t('serverMarketplace.needsSetup')}</div>
      <p className="text-muted">{plugin.autoInstallReason || t('serverMarketplace.needsSetupHint')}</p>
      {href && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          {t('serverMarketplace.setupGuide')} ↗
        </a>
      )}
    </div>
  );
}
