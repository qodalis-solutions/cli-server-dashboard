import { errorText } from '@qodalis/cli-server-dashboard-kit';
import { apiFetch, ApiError } from './client';
import { configValidationError } from './config';
import type {
  ConfigValue,
  MarketplaceConfigEntry,
  MarketplaceFile,
  MarketplaceInstallOptions,
  MarketplaceInstallResult,
  MarketplaceInfo,
  MarketplaceInstalledPlugin,
  MarketplacePage,
  MarketplacePluginConfigValues,
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

/** The config provider holding one section per installed dashboard plugin (section id = the plugin's page id). */
export const DASHBOARD_PLUGINS_PROVIDER = 'dashboard-plugins';

/** The Config page at an installed dashboard plugin's settings. */
export function pluginSettingsPath(id: string): string {
  return `/config?${new URLSearchParams({ provider: DASHBOARD_PLUGINS_PROVIDER, section: id })}`;
}

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

const CONFIG_TYPES: ReadonlySet<string> = new Set(['string', 'number', 'boolean', 'string[]', 'enum', 'json', 'duration', 'url']);

function readValidation(value: unknown): MarketplaceConfigEntry['validation'] | undefined {
  if (!isObject(value)) return undefined;
  const rules: NonNullable<MarketplaceConfigEntry['validation']> = {
    ...(typeof value.min === 'number' ? { min: value.min } : {}),
    ...(typeof value.max === 'number' ? { max: value.max } : {}),
    ...(typeof value.pattern === 'string' ? { pattern: value.pattern } : {}),
    ...(Array.isArray(value.options) ? { options: value.options.filter((o): o is string => typeof o === 'string') } : {}),
    ...(value.required === true ? { required: true } : {}),
  };
  return Object.keys(rules).length > 0 ? rules : undefined;
}

/** `{ entries }` of a version or plugin; entries without a key or with an unknown type (a `secret`) are dropped. */
export function readPluginConfig(value: unknown): { entries: MarketplaceConfigEntry[] } | undefined {
  if (!isObject(value) || !Array.isArray(value.entries)) return undefined;
  const entries = value.entries.filter(isObject)
    .filter(e => typeof e.key === 'string' && e.key && typeof e.type === 'string' && CONFIG_TYPES.has(e.type))
    .map((e): MarketplaceConfigEntry => {
      const validation = readValidation(e.validation);
      return {
        key: e.key as string,
        ...(optionalText(e.label) ? { label: e.label as string } : {}),
        ...(optionalText(e.description) ? { description: e.description as string } : {}),
        type: e.type as MarketplaceConfigEntry['type'],
        default: (e.default ?? null) as ConfigValue,
        ...(validation ? { validation } : {}),
      };
    });
  return entries.length > 0 ? { entries } : undefined;
}

function readVersion(value: Json): MarketplaceVersionInfo {
  const config = readPluginConfig(value.config);
  return {
    version: text(value.version),
    ...(typeof value.publishedAt === 'string' ? { publishedAt: value.publishedAt } : {}),
    ...(typeof value.dashboardApi === 'number' ? { dashboardApi: value.dashboardApi } : {}),
    files: readFiles(value.files),
    ...(typeof value.deprecated === 'string' && value.deprecated ? { deprecated: value.deprecated } : {}),
    ...(config ? { config } : {}),
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
  const config = readPluginConfig(value.config);
  return {
    ...readPluginItem(value),
    readme: text(value.readme),
    ...(config ? { config } : {}),
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

/**
 * The settings a plugin's version declares: the version's own, else the plugin's (its latest version's). `version`
 * defaults to the latest.
 */
export function versionConfig(details: MarketplacePluginDetails, version = details.latest): MarketplaceConfigEntry[] {
  const record = details.versions.find(v => v.version === version);
  if (record?.config) return record.config.entries;
  // The plugin's own `config` is its latest version's
  return !record || version === details.latest ? (details.config?.entries ?? []) : [];
}

function readInstallResult(value: unknown): MarketplaceInstallResult {
  if (!isObject(value)) return {};
  const dropped = Array.isArray(value.configDropped) ? value.configDropped.filter((k): k is string => typeof k === 'string') : [];
  return { ...(value as MarketplaceInstallResult), configDropped: dropped };
}

/**
 * Sends an install or update; settings that do not validate reject with the config providers'
 * {@link ConfigValidationError} (400 per-key errors), any other failure with its {@link ApiError}.
 */
async function sendInstall(path: string, method: 'POST' | 'PUT', body: Json): Promise<MarketplaceInstallResult> {
  try {
    return readInstallResult(await apiFetch<unknown>(path, { method, body: JSON.stringify(body) }));
  } catch (err) {
    throw configValidationError(err) ?? err;
  }
}

const installBody = ({ version, config }: MarketplaceInstallOptions): Json => ({
  ...(version ? { version } : {}),
  ...(config && Object.keys(config).length > 0 ? { config } : {}),
});

/** Installs `name`: the latest fitting version unless `version`, with `config` applied (only the settings given). */
export function installMarketplacePlugin(name: string, options: MarketplaceInstallOptions = {}): Promise<MarketplaceInstallResult> {
  return sendInstall(`${MARKETPLACE_API}/installed`, 'POST', { name, ...installBody(options) });
}

/**
 * Updates `name` to `version`, or the latest fitting one, with `config` applied over the stored settings that still fit
 * (the others are reset and listed in `configDropped`).
 */
export function updateMarketplacePlugin(name: string, options: MarketplaceInstallOptions = {}): Promise<MarketplaceInstallResult> {
  return sendInstall(`${MARKETPLACE_API}/installed/${encodeURIComponent(name)}`, 'PUT', installBody(options));
}

/** An installed plugin's settings: its stored values over the defaults (`{}` for a plugin without settings). */
export async function getInstalledPluginConfig(name: string): Promise<MarketplacePluginConfigValues> {
  const res = await apiFetch<unknown>(`${MARKETPLACE_API}/installed/${encodeURIComponent(name)}/config`);
  return {
    values: isObject(res) && isObject(res.values) ? (res.values as Record<string, ConfigValue>) : {},
    version: isObject(res) && typeof res.version === 'string' ? res.version : null,
  };
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
