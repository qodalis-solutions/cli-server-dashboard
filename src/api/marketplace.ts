import { errorText } from '@qodalis/cli-server-dashboard-kit';
import { apiFetch, ApiError } from './client';
import type {
  MarketplaceFile,
  MarketplaceInfo,
  MarketplaceInstalledPlugin,
  MarketplacePage,
  MarketplacePluginDetails,
  MarketplacePluginItem,
  MarketplaceServerPackage,
  MarketplaceVersionInfo,
} from '../types';

/** The admin plugin's marketplace endpoints (dashboard plugins installed at runtime). */
export const MARKETPLACE_API = '/api/v1/qcli/dashboard/marketplace';

/** The permission installing, updating and removing dashboard plugins needs. */
export const INSTALL_PERMISSION = 'dashboard:install';

/** The server event sent when a dashboard plugin is installed, updated or removed. */
export const EXTENSIONS_CHANGED_EVENT = 'dashboard:extensions-changed';

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const optionalText = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

function readFiles(value: unknown): MarketplaceFile[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).filter(f => typeof f.path === 'string').map(f => ({
    path: f.path as string,
    ...(typeof f.integrity === 'string' ? { integrity: f.integrity } : {}),
    ...(typeof f.size === 'number' ? { size: f.size } : {}),
  }));
}

/** `{ node: '@x/y', dotnet: 'X.Y' }` (the contract) or `[{ ecosystem, name }]` (the marketplace's own list). */
function readServerPackages(value: unknown): MarketplaceServerPackage[] {
  if (Array.isArray(value)) {
    return value.filter(isObject).filter(p => typeof p.name === 'string').map(p => ({
      platform: text(p.platform) || text(p.ecosystem),
      name: p.name as string,
    }));
  }
  if (isObject(value)) {
    return Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1])
      .map(([platform, name]) => ({ platform, name }));
  }
  return [];
}

function readVersion(value: Json): MarketplaceVersionInfo {
  return {
    version: text(value.version),
    ...(typeof value.publishedAt === 'string' ? { publishedAt: value.publishedAt } : {}),
    ...(typeof value.dashboardApi === 'number' ? { dashboardApi: value.dashboardApi } : {}),
    files: readFiles(value.files),
    ...(typeof value.deprecated === 'string' && value.deprecated ? { deprecated: value.deprecated } : {}),
  };
}

/** A marketplace item with the server's annotations; missing fields get safe defaults (not installed, not allowed). */
export function readPluginItem(value: Json): MarketplacePluginItem {
  const publisher = isObject(value.publisher) ? value.publisher : {};
  const installed = isObject(value.installed) && typeof value.installed.version === 'string'
    ? { version: value.installed.version }
    : null;
  const requires = isObject(value.requires) && typeof value.requires.serverPackage === 'string'
    ? { serverPackage: value.requires.serverPackage, installed: value.requires.installed === true }
    : null;
  const name = text(value.name);
  return {
    name,
    title: text(value.title) || text(value.shortName) || name,
    description: text(value.description),
    ...(optionalText(value.icon) ? { icon: value.icon as string } : {}),
    publisher: { name: text(publisher.name), verified: publisher.verified === true },
    latest: typeof value.latest === 'string' ? value.latest : typeof value.version === 'string' ? value.version : null,
    installed,
    updateAvailable: value.updateAvailable === true,
    allowed: value.allowed === true,
    ...(optionalText(value.blockedReason) ? { blockedReason: value.blockedReason as string } : {}),
    requires,
  };
}

function readDetails(value: Json): MarketplacePluginDetails {
  return {
    ...readPluginItem(value),
    readme: text(value.readme),
    versions: Array.isArray(value.versions) ? value.versions.filter(isObject).map(readVersion).filter(v => v.version) : [],
    serverPackages: readServerPackages(value.serverPackages),
    ...(optionalText(value.homepage) ? { homepage: value.homepage as string } : {}),
    ...(optionalText(value.repository) ? { repository: value.repository as string } : {}),
    ...(optionalText(value.license) ? { license: value.license as string } : {}),
  };
}

/**
 * The server's marketplace settings, or null when it has none (no admin plugin marketplace: 404/405): the dashboard
 * then shows no Marketplace tab content but a note.
 */
export async function getMarketplaceInfo(): Promise<MarketplaceInfo | null> {
  try {
    const info = await apiFetch<Json>(MARKETPLACE_API);
    if (!isObject(info)) return null;
    const install = info.install === 'listed' || info.install === 'off' ? info.install : 'verified';
    return {
      marketplaceUrl: text(info.marketplaceUrl),
      install,
      dashboardApi: typeof info.dashboardApi === 'number' ? info.dashboardApi : 1,
    };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) return null;
    throw err;
  }
}

/** One page (1-based) of the marketplace's dashboard plugins matching `query`. */
export async function searchMarketplace({ query = '', page = 1, pageSize = 20 }: { query?: string; page?: number; pageSize?: number } = {}): Promise<MarketplacePage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query.trim()) params.set('query', query.trim());
  const res = await apiFetch<Json>(`${MARKETPLACE_API}/plugins?${params}`);
  const items = Array.isArray(res?.items) ? res.items.filter(isObject).map(readPluginItem) : [];
  return {
    items,
    total: typeof res?.total === 'number' ? res.total : items.length,
    page: typeof res?.page === 'number' ? res.page : page,
    pageSize: typeof res?.pageSize === 'number' ? res.pageSize : pageSize,
  };
}

/** A plugin's details: readme, versions with their files, server packages. */
export async function getMarketplacePlugin(name: string): Promise<MarketplacePluginDetails> {
  return readDetails(await apiFetch<Json>(`${MARKETPLACE_API}/plugins/${encodeURIComponent(name)}`));
}

/** The dashboard plugins installed from the marketplace; none on servers without the marketplace (404/405). */
export async function getMarketplaceInstalled(): Promise<MarketplaceInstalledPlugin[]> {
  let res: unknown;
  try {
    res = await apiFetch<unknown>(`${MARKETPLACE_API}/installed`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) return [];
    throw err;
  }
  const list = Array.isArray(res) ? res : isObject(res) && Array.isArray(res.items) ? res.items : [];
  return list.filter(isObject).filter(p => typeof p.name === 'string').map(p => ({
    name: p.name as string,
    version: text(p.version),
    title: text(p.title) || (p.name as string),
    ...(optionalText(p.icon) ? { icon: p.icon as string } : {}),
    id: text(p.id),
    ...(optionalText(p.installedAt) ? { installedAt: p.installedAt as string } : {}),
    ...(optionalText(p.installedBy) ? { installedBy: p.installedBy as string } : {}),
    ...(p.updateAvailable === true ? { updateAvailable: true } : {}),
  }));
}

const body = (version?: string) => JSON.stringify(version ? { version } : {});

/** Installs `name` (the latest fitting version unless `version`). */
export function installMarketplacePlugin(name: string, version?: string): Promise<MarketplaceInstalledPlugin> {
  return apiFetch(`${MARKETPLACE_API}/installed`, { method: 'POST', body: JSON.stringify(version ? { name, version } : { name }) });
}

/** Updates `name` to `version`, or the latest fitting one. */
export function updateMarketplacePlugin(name: string, version?: string): Promise<MarketplaceInstalledPlugin> {
  return apiFetch(`${MARKETPLACE_API}/installed/${encodeURIComponent(name)}`, { method: 'PUT', body: body(version) });
}

export function removeMarketplacePlugin(name: string): Promise<void> {
  return apiFetch(`${MARKETPLACE_API}/installed/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

/** What went wrong with a marketplace request, for the message the dashboard shows. */
export type MarketplaceErrorKind = 'unreachable' | 'unverified' | 'integrity' | 'clash' | 'forbidden' | 'other';

/**
 * The kind of a failed marketplace request: 502 the marketplace or its CDN could not be reached (or a file's sha384
 * did not match: `integrity`), 403 a publisher that is not verified (or a missing permission), 409 an extension id
 * already taken.
 */
export function marketplaceErrorKind(err: unknown): MarketplaceErrorKind {
  const message = errorText(err).toLowerCase();
  const status = err instanceof ApiError ? err.status : 0;
  if (/integrity|sha384|checksum/.test(message)) return 'integrity';
  if (status === 502 || status === 503 || status === 504 || /unreachable/.test(message)) return 'unreachable';
  if (status === 403) return /verified/.test(message) ? 'unverified' : 'forbidden';
  if (status === 409) return 'clash';
  return 'other';
}
