/** How a plugin's or module's icon is shown: an image, or a text glyph (emoji). */
export type ModuleIcon =
  | { kind: 'image'; src: string }
  | { kind: 'text'; text: string };

/** Shown for a plugin or module with no icon of its own and none in {@link KNOWN_ICONS}. */
export const DEFAULT_PLUGIN_ICON = '🧩';

/**
 * Icons of the first-party packages and modules, for servers that do not send one (older servers),
 * by {@link pluginKey}: the .NET, Node and Python ids and names of a package reduce to the same key.
 */
const KNOWN_ICONS: Record<string, string> = {
  core: '🖥️',
  qodaliscli: '🖥️',
  cliservernode: '🖥️',
  qodaliscliserver: '🖥️',
  abstractions: '🧱',
  qodaliscliabstractions: '🧱',
  cliserverabstractions: '🧱',
  qodaliscliserverabstractions: '🧱',
  admin: '🎛️',
  audit: '🛡️',
  auditefcore: '🗄️',
  aws: '☁️',
  jobs: '⏱️',
  jobsefcore: '🗄️',
  users: '👥',
  usersefcore: '🗄️',
  weather: '🌤️',
  logsseq: '📜',
  filesystem: '📁',
  filesystemjson: '📄',
  filesystemsqlite: '🪶',
  filesystems3: '🪣',
  filesystemefcore: '🗄️',
  dataexplorer: '📊',
  dataexplorersql: '🪶',
  dataexplorerpostgres: '🐘',
  dataexplorermysql: '🐬',
  dataexplorermssql: '🗃️',
  dataexplorermongo: '🍃',
  dataexplorerredis: '🔴',
  dataexplorerelasticsearch: '🔍',
};

/** The package prefixes of the three servers, dropped before the lookup. */
const PREFIXES = [/^@[^/]+\//, /^qodalis\.cli\.plugin\./, /^qodalis-cli-server-plugin-/, /^cli-server-plugin-/];

/**
 * A package or module name reduced to its lookup key: lower case, without the package prefix and separators
 * (`Qodalis.Cli.Plugin.DataExplorer.Sql`, `@qodalis/cli-server-plugin-data-explorer-sql` and `Data Explorer Sql`
 * are all `dataexplorersql`).
 */
export function pluginKey(value: string): string {
  let key = value.trim().toLowerCase();
  for (const prefix of PREFIXES) key = key.replace(prefix, '');
  return key.replace(/[^\p{L}\p{N}]/gu, '');
}

/** The built-in icon of the first of `names` (package id, name, ...) that is a known first-party package or module. */
export function knownPluginIcon(...names: Array<string | null | undefined>): string | undefined {
  for (const name of names) {
    const icon = name ? KNOWN_ICONS[pluginKey(name)] : undefined;
    if (icon) return icon;
  }
  return undefined;
}

/** The icon of a plugin or module without one of its own: its built-in icon, else the default. */
export function fallbackPluginIcon(...names: Array<string | null | undefined>): string {
  return knownPluginIcon(...names) ?? DEFAULT_PLUGIN_ICON;
}

/** An absolute http(s) URL or a root-relative path (not `//host`): never `javascript:` or `data:`. */
export function isIconUrl(value: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(value) || /^\/(?![/\\])[^\s]*$/.test(value);
}

/**
 * The icon to show for a plugin or module: the server's `icon` (a URL as an image, anything else as text, e.g. an
 * emoji), else the built-in icon of a known package or module (`names`: its id, name, ...), else the default icon.
 */
export function resolveModuleIcon(icon: string | null | undefined, ...names: Array<string | null | undefined>): ModuleIcon {
  const value = typeof icon === 'string' ? icon.trim() : '';
  if (value) {
    if (isIconUrl(value)) return { kind: 'image', src: value };
    // Text icons are a glyph or two, not a sentence; something longer (or another scheme) is not shown
    if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && [...value].length <= 8) return { kind: 'text', text: value };
  }
  return { kind: 'text', text: fallbackPluginIcon(...names) };
}
