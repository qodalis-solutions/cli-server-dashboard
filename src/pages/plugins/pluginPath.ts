/** The details page of a module or an installed package (ids such as `@qodalis/cli-server-plugin-weather` encoded). */
export function pluginPath(id: string): string {
  return `/plugins/${encodeURIComponent(id)}`;
}

/** The Plugins page's tabs, kept in the URL (`/plugins?tab=marketplace`). */
export type PluginsTab = 'installed' | 'marketplace' | 'updates';

/** The Plugins page's tab from the URL's `tab` (Installed unless `marketplace` or `updates`). */
export function pluginsTab(params: URLSearchParams): PluginsTab {
  const tab = params.get('tab');
  return tab === 'marketplace' || tab === 'updates' ? tab : 'installed';
}

/** Navigation state the Plugins page reads: the title of a page that was removed while it was open. */
export interface PluginsPageState {
  removedPage?: string;
}

/** The Marketplace tab's kinds of plugins, kept in the URL (`?tab=marketplace&kind=server`). */
export type MarketplaceKind = 'dashboard' | 'server';

/** The Marketplace tab's kind from the URL's `kind` (Dashboard plugins unless `server`). */
export function marketplaceKind(params: URLSearchParams): MarketplaceKind {
  return params.get('kind') === 'server' ? 'server' : 'dashboard';
}

/** The Server plugins' platform filter (`&platform=`): this server's (default), all, or one platform. */
export type PlatformFilter = 'this' | 'all' | 'node' | 'python' | 'dotnet';

/** The platform filter from the URL's `platform` (this server's unless `all`, `node`, `python` or `dotnet`). */
export function platformFilter(params: URLSearchParams): PlatformFilter {
  const value = params.get('platform');
  return value === 'all' || value === 'node' || value === 'python' || value === 'dotnet' ? value : 'this';
}

/** The marketplace tabs' installed filter (`&installed=yes|no`); `any` without it. */
export type InstalledFilter = 'any' | 'yes' | 'no';

/** The installed filter from the URL's `installed`. */
export function installedFilter(params: URLSearchParams): InstalledFilter {
  const value = params.get('installed');
  return value === 'yes' || value === 'no' ? value : 'any';
}

/** The marketplace's own site (`https://plugins.qodalis.com/?kind=server`) listing the chosen kind; none without an http(s) URL. */
export function marketplaceSite(url: string | undefined, kind: MarketplaceKind): { href: string; host: string } | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const site = new URL(url);
    site.search = '';
    site.hash = '';
    site.searchParams.set('kind', kind);
    return { href: site.toString(), host: site.host };
  } catch {
    return null;
  }
}
