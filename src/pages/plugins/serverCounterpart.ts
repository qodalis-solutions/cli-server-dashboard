import { getServerMarketplaceInfo, searchServerPlugins } from '../../api/serverMarketplace';
import type { MarketplaceServerPackage, ServerPluginItem } from '../../types';

/**
 * The server plugin a dashboard plugin needs (its marketplace `requires.serverPackage`, this server's package) when it
 * is not installed: one this server can install from the marketplace, or the packages to add in the server's code.
 */
export type ServerCounterpart =
  | { kind: 'installable'; plugin: ServerPluginItem }
  | { kind: 'code'; packages: MarketplaceServerPackage[] };

/** `@qodalis/cli-server-plugin-data-explorer` → `data-explorer`: the words the server marketplace is searched with. */
export function serverPluginQuery(serverPackage: string): string {
  const bare = serverPackage.includes('/') ? serverPackage.slice(serverPackage.indexOf('/') + 1) : serverPackage;
  return bare
    .replace(/^(qodalis-)?cli-server-plugin-/i, '')
    .replace(/^Qodalis\.Cli\.Plugin\./, '')
    .toLowerCase();
}

/**
 * Where the server plugin comes from: installable here when the server marketplace is on, lists it for this platform,
 * allows it, and the user may install server plugins; else the packages to add in code (the dashboard plugin's
 * `serverPackages`, or the one package it requires).
 */
export async function findServerCounterpart(
  serverPackage: string,
  packages: MarketplaceServerPackage[],
  canInstallServerPlugins: boolean,
): Promise<ServerCounterpart> {
  const code: ServerCounterpart = { kind: 'code', packages: packages.length > 0 ? packages : [{ platform: '', name: serverPackage }] };
  if (!canInstallServerPlugins) return code;
  try {
    const info = await getServerMarketplaceInfo();
    if (!info || !info.enabled || info.install === 'off') return code;
    const query = serverPluginQuery(serverPackage);
    const page = await searchServerPlugins({ query, pageSize: 50 });
    const plugin = page.items.find(p => p.platform?.package === serverPackage) ?? page.items.find(p => p.name === query && !!p.platform);
    return plugin && plugin.allowed && !plugin.installed ? { kind: 'installable', plugin } : code;
  } catch {
    return code;
  }
}
