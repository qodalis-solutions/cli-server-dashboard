import { errorText } from '@qodalis/cli-server-dashboard-kit';
import { apiFetch, ApiError } from './client';
import { readInstalled as readInstallState, readPluginConfig } from './marketplace';
import type {
  InstalledServerPlugin,
  InstalledServerPluginStatus,
  ServerMarketplaceInfo,
  ServerPlatform,
  ServerPluginChangeResult,
  ServerPluginDetails,
  ServerPluginItem,
  ServerPluginOwnPlatform,
  ServerPluginPackage,
  ServerPluginPage,
  ServerPluginVersion,
} from '../types';

/** The admin plugin's server marketplace (server plugins installed at runtime, run after a restart). */
export const SERVER_MARKETPLACE_API = '/api/v1/qcli/server/marketplace';

/** The permission installing, updating and removing server plugins needs. */
export const PLUGINS_INSTALL_PERMISSION = 'plugins:install';

/** The server event sent when a server plugin is installed, updated or removed. */
export const SERVER_PLUGINS_CHANGED_EVENT = 'server:plugins-changed';

/** Every server platform, in the order the badges show them. */
export const SERVER_PLATFORMS: readonly ServerPlatform[] = ['node', 'python', 'dotnet'];

/** A platform's name as people know it. */
export const PLATFORM_LABELS: Record<ServerPlatform, string> = { node: 'Node', python: 'Python', dotnet: '.NET' };

/** The registry each platform's packages come from. */
const REGISTRY_PLATFORM: Record<string, ServerPlatform> = { npm: 'node', pypi: 'python', nuget: 'dotnet' };

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const optionalText = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
const isPlatform = (value: unknown): value is ServerPlatform => typeof value === 'string' && (SERVER_PLATFORMS as readonly string[]).includes(value);
/** An http(s) URL; anything else from a package's metadata is not linked. */
const httpUrl = (value: unknown): string | undefined => (typeof value === 'string' && /^https?:\/\//i.test(value) ? value : undefined);

/** `npm install …`, `pip install …` or `dotnet add package …` for a platform's package. */
export function installCommand(platform: ServerPlatform, pkg: string): string {
  if (platform === 'python') return `pip install ${pkg}`;
  if (platform === 'dotnet') return `dotnet add package ${pkg}`;
  return `npm install ${pkg}`;
}

/** `{ node: { package, … } }` (the marketplace's map) or `[{ platform, package }]`. */
function readPlatforms(value: unknown): Partial<Record<ServerPlatform, ServerPluginPackage>> {
  const entries: Array<[unknown, unknown]> = Array.isArray(value)
    ? value.filter(isObject).map(p => [p.platform ?? REGISTRY_PLATFORM[text(p.registry)], p])
    : isObject(value) ? Object.entries(value) : [];
  const platforms: Partial<Record<ServerPlatform, ServerPluginPackage>> = {};
  for (const [platform, p] of entries) {
    if (!isPlatform(platform) || !isObject(p) || typeof p.package !== 'string' || !p.package) continue;
    platforms[platform] = {
      package: p.package,
      ...(optionalText(p.registry) ? { registry: p.registry as string } : {}),
      latest: typeof p.latest === 'string' ? p.latest : null,
      ...(optionalText(p.install) ? { install: p.install as string } : {}),
      ...(optionalText(p.readme) ? { readme: p.readme as string } : {}),
      ...(optionalText(p.readmeFormat) ? { readmeFormat: p.readmeFormat as string } : {}),
    };
  }
  return platforms;
}

function readOwnPlatform(value: unknown): ServerPluginOwnPlatform | null {
  if (!isObject(value) || typeof value.package !== 'string') return null;
  return {
    package: value.package,
    latest: typeof value.latest === 'string' ? value.latest : null,
    installed: typeof value.installed === 'string' ? value.installed : null,
    compatible: value.compatible !== false,
    ...(optionalText(value.reason) ? { reason: value.reason as string } : {}),
  };
}

/** A server plugin with the server's annotations; missing fields get safe defaults (not installed, not allowed). */
export function readServerPluginItem(value: Json): ServerPluginItem {
  const publisher = isObject(value.publisher) ? value.publisher : {};
  const name = text(value.name);
  const homepage = httpUrl(value.homepage);
  const repository = httpUrl(isObject(value.repository) ? value.repository.url : value.repository);
  const own = readOwnPlatform(value.platform);
  return {
    name,
    title: text(value.title) || text(value.shortName) || name,
    description: text(value.description),
    ...(optionalText(value.icon) ? { icon: value.icon as string } : {}),
    publisher: { name: text(publisher.name), verified: publisher.verified === true },
    platforms: readPlatforms(value.platforms),
    platform: own,
    otherPlatforms: Array.isArray(value.otherPlatforms) ? value.otherPlatforms.filter((p): p is string => typeof p === 'string') : [],
    autoInstall: value.autoInstall !== false,
    ...(optionalText(value.autoInstallReason) ? { autoInstallReason: value.autoInstallReason as string } : {}),
    installed: readInstallState(value.installed) ?? (own?.installed ? { version: own.installed, source: 'marketplace' } : null),
    updateAvailable: value.updateAvailable === true,
    allowed: value.allowed === true,
    ...(optionalText(value.blockedReason) ? { blockedReason: value.blockedReason as string } : {}),
    ...(homepage ? { homepage } : {}),
    ...(repository ? { repository } : {}),
  };
}

function readVersion(value: Json): ServerPluginVersion {
  return {
    version: text(value.version),
    platform: text(value.platform) || REGISTRY_PLATFORM[text(value.registry)] || '',
    ...(optionalText(value.package) ? { package: value.package as string } : {}),
    ...(optionalText(value.status) ? { status: value.status as string } : {}),
    ...(optionalText(value.publishedAt) ? { publishedAt: value.publishedAt as string } : {}),
    ...(optionalText(value.serverRange) ? { serverRange: value.serverRange as string } : {}),
    ...(typeof value.allowed === 'boolean' ? { allowed: value.allowed } : {}),
    ...(optionalText(value.blockedReason) ? { blockedReason: value.blockedReason as string } : {}),
  };
}

const compareVersions = (a: string, b: string) => b.localeCompare(a, undefined, { numeric: true });

function readDetails(value: Json): ServerPluginDetails {
  const versions = Array.isArray(value.versions) ? value.versions.filter(isObject).map(readVersion).filter(v => v.version) : [];
  versions.sort((a, b) => compareVersions(a.version, b.version));
  // The plugin's settings, or its newest version's that declares some
  const config = readPluginConfig(value.config)
    ?? (Array.isArray(value.versions) ? value.versions.filter(isObject).map(v => readPluginConfig(v.config)).find(c => c) : undefined);
  return {
    ...readServerPluginItem(value),
    readme: text(value.readme),
    versions,
    ...(config ? { config } : {}),
    ...(optionalText(value.license) ? { license: value.license as string } : {}),
  };
}

/**
 * The server's marketplace settings for server plugins, or null when it has none (an admin plugin without the server
 * marketplace: 404/405).
 */
export async function getServerMarketplaceInfo(): Promise<ServerMarketplaceInfo | null> {
  try {
    const info = await apiFetch<Json>(SERVER_MARKETPLACE_API);
    if (!isObject(info)) return null;
    return {
      marketplaceUrl: text(info.marketplaceUrl),
      install: info.install === 'listed' || info.install === 'off' ? info.install : 'verified',
      platform: isPlatform(info.platform) ? info.platform : null,
      serverVersion: optionalText(info.serverVersion) ?? null,
      enabled: info.enabled !== false,
    };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) return null;
    throw err;
  }
}

/**
 * This server's platform: the one the server names, else the platform whose package is the plugin's own, else the one
 * whose registry alone allows the package's name (`@scope/x` npm, `Dotted.PascalCase` NuGet).
 */
export function ownPlatform(info: ServerMarketplaceInfo | null, item?: ServerPluginItem): ServerPlatform | null {
  if (info?.platform) return info.platform;
  if (!item?.platform) return null;
  const own = item.platform.package;
  for (const platform of SERVER_PLATFORMS) {
    if (item.platforms[platform]?.package === own) return platform;
  }
  // A name only one registry allows
  if (/^@/.test(own)) return 'node';
  if (/^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]*)+$/.test(own)) return 'dotnet';
  return null;
}

/** One page (1-based) of the marketplace's server plugins for this server's platform matching `query`. */
export async function searchServerPlugins({ query = '', page = 1, pageSize = 20 }: { query?: string; page?: number; pageSize?: number } = {}): Promise<ServerPluginPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (query.trim()) params.set('query', query.trim());
  const res = await apiFetch<Json>(`${SERVER_MARKETPLACE_API}/plugins?${params}`);
  const items = Array.isArray(res?.items) ? res.items.filter(isObject).map(readServerPluginItem) : [];
  return {
    items,
    total: typeof res?.total === 'number' ? res.total : items.length,
    page: typeof res?.page === 'number' ? res.page : page,
    pageSize: typeof res?.pageSize === 'number' ? res.pageSize : pageSize,
  };
}

/** A server plugin's details: every platform's versions, readme, settings. */
export async function getServerPlugin(name: string): Promise<ServerPluginDetails> {
  return readDetails(await apiFetch<Json>(`${SERVER_MARKETPLACE_API}/plugins/${encodeURIComponent(name)}`));
}

const STATUSES: readonly string[] = ['loaded', 'pending', 'failed', 'skipped', 'removed', 'needs-configuration'];

function readInstalled(p: Json): InstalledServerPlugin {
  const name = p.name as string;
  return {
    name,
    package: text(p.package) || name,
    version: text(p.version),
    title: text(p.title) || name,
    ...(optionalText(p.icon) ? { icon: p.icon as string } : {}),
    ...(optionalText(p.description) ? { description: p.description as string } : {}),
    ...(optionalText(p.installedAt) ? { installedAt: p.installedAt as string } : {}),
    ...(optionalText(p.installedBy) ? { installedBy: p.installedBy as string } : {}),
    status: STATUSES.includes(text(p.status)) ? (p.status as InstalledServerPluginStatus) : 'pending',
    loadedVersion: typeof p.loadedVersion === 'string' ? p.loadedVersion : null,
    ...(optionalText(p.error) ? { error: p.error as string } : {}),
    ...(p.updateAvailable === true ? { updateAvailable: true } : {}),
    ...(Array.isArray(p.missing) ? { missing: p.missing.filter((m): m is string => typeof m === 'string') } : {}),
    ...(optionalText(p.settings) ? { settings: p.settings as string } : {}),
  };
}

/** The Config page at a server plugin's settings provider (`settings`, else the provider named after the plugin). */
export function serverPluginSettingsPath(plugin: { name: string; settings?: string }): string {
  return `/config?${new URLSearchParams({ provider: plugin.settings ?? plugin.name })}`;
}

/** The server plugins installed from the marketplace and how they run; none on servers without it (404/405). */
export async function getInstalledServerPlugins(): Promise<InstalledServerPlugin[]> {
  let res: unknown;
  try {
    res = await apiFetch<unknown>(`${SERVER_MARKETPLACE_API}/installed`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 405)) return [];
    throw err;
  }
  const list = Array.isArray(res) ? res : isObject(res) && Array.isArray(res.items) ? res.items : [];
  return list.filter(isObject).filter(p => typeof p.name === 'string' && p.name).map(readInstalled);
}

function readChange(value: unknown): ServerPluginChangeResult {
  if (!isObject(value)) return { restartRequired: true };
  return {
    ...(typeof value.name === 'string' ? readInstalled(value) : {}),
    restartRequired: value.restartRequired !== false,
    ...(typeof value.changed === 'boolean' ? { changed: value.changed } : {}),
    ...(optionalText(value.previousVersion) ? { previousVersion: value.previousVersion as string } : {}),
  };
}

/** Installs this server's package of `name` (the newest compatible version unless `version`); it runs after a restart. */
export async function installServerPlugin(name: string, version?: string): Promise<ServerPluginChangeResult> {
  return readChange(await apiFetch<unknown>(`${SERVER_MARKETPLACE_API}/installed`, {
    method: 'POST',
    body: JSON.stringify({ name, ...(version ? { version } : {}) }),
  }));
}

/** Updates `name` to `version`, or the newest compatible one; `changed: false` when it already was. */
export async function updateServerPlugin(name: string, version?: string): Promise<ServerPluginChangeResult> {
  return readChange(await apiFetch<unknown>(`${SERVER_MARKETPLACE_API}/installed/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify(version ? { version } : {}),
  }));
}

/** Uninstalls `name`; it keeps running until the restart. */
export async function removeServerPlugin(name: string): Promise<ServerPluginChangeResult> {
  return readChange(await apiFetch<unknown>(`${SERVER_MARKETPLACE_API}/installed/${encodeURIComponent(name)}`, { method: 'DELETE' }));
}

/** What went wrong with a server plugin request, for the message the dashboard shows. */
export type ServerPluginErrorKind = 'unreachable' | 'integrity' | 'unverified' | 'forbidden' | 'incompatible' | 'setup' | 'unavailable' | 'clash' | 'other';

/**
 * The kind of a failed server plugin request: 502 the marketplace or registry could not be reached (or the package's
 * sha512 did not match: `integrity`), 403 an unverified publisher (or a missing permission), 400 incompatible, needs
 * setup in code or not available for this platform, 409 a package the host installed in code.
 */
export function serverPluginErrorKind(err: unknown): ServerPluginErrorKind {
  const message = errorText(err).toLowerCase();
  const status = err instanceof ApiError ? err.status : 0;
  if (/integrity|sha512|checksum/.test(message)) return 'integrity';
  if (status === 502 || status === 503 || status === 504 || /unreachable/.test(message)) return 'unreachable';
  if (status === 403) return /verified/.test(message) ? 'unverified' : 'forbidden';
  if (/needs setup in code/.test(message)) return 'setup';
  if (/incompatible|needs server/.test(message)) return 'incompatible';
  if (/not available for/.test(message)) return 'unavailable';
  if (status === 409) return 'clash';
  return 'other';
}

/** The detail after `incompatible: ` or `needs setup in code: ` of a server's message, when it gives one. */
export function serverErrorDetail(err: unknown): string {
  const message = errorText(err);
  const colon = message.indexOf(': ');
  return colon >= 0 ? message.slice(colon + 2) : '';
}
