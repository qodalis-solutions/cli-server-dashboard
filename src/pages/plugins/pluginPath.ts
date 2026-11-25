/** The details page of a module or an installed package (ids such as `@qodalis/cli-server-plugin-weather` encoded). */
export function pluginPath(id: string): string {
  return `/plugins/${encodeURIComponent(id)}`;
}

/** The Plugins page's tabs, kept in the URL (`/plugins?tab=marketplace`). */
export type PluginsTab = 'installed' | 'marketplace';

/** The Plugins page's tab from the URL's `tab` (Installed unless `marketplace`). */
export function pluginsTab(params: URLSearchParams): PluginsTab {
  return params.get('tab') === 'marketplace' ? 'marketplace' : 'installed';
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
