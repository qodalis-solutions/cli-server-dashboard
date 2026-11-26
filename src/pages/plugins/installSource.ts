import type { MarketplaceInstalled, ServerPlatform, ServerPluginItem } from '../../types';
import type { InstalledFilter, PlatformFilter } from './pluginPath';

/** True when the server has the plugin because the host added it in code (no install, update or removal here). */
export function addedInCode(installed: MarketplaceInstalled | null | undefined): boolean {
  return installed?.source === 'code';
}

/** True when the plugin was installed from the marketplace (update and remove it here). */
export function fromMarketplace(installed: MarketplaceInstalled | null | undefined): boolean {
  return installed?.source === 'marketplace';
}

/**
 * Whether a plugin passes the filters: this server's platform (it has a package here), all, or one platform; installed
 * (from the marketplace or in code) or not. Filtered on the page the server sent: the servers ask the marketplace for
 * their own platform only and do not pass `platform` on.
 */
export function matchesFilters(plugin: ServerPluginItem, platform: ServerPlatform | null, byPlatform: PlatformFilter, byInstalled: InstalledFilter): boolean {
  if (byInstalled === 'yes' && !plugin.installed) return false;
  if (byInstalled === 'no' && plugin.installed) return false;
  if (byPlatform === 'all') return true;
  if (byPlatform === 'this') return !!plugin.platform;
  return !!plugin.platforms[byPlatform] || (byPlatform === platform && !!plugin.platform);
}
