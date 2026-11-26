import type { DashboardPluginConfigEntry } from '@qodalis/cli-server-dashboard-kit';

// POST /api/v1/qcli/auth/login
export interface AuthLoginRequest {
  username: string;
  password: string;
}
export interface AuthLoginResponse {
  token: string;        // JWT token
  expiresIn: number;    // Seconds until expiry
  username: string;
}

// GET /api/v1/qcli/auth/me
export interface AuthMeResponse {
  username: string;
  authenticatedAt: string; // ISO 8601
}

// GET /api/v1/qcli/status
export interface ServerStatusResponse {
  uptimeSeconds: number;
  startedAt: string;              // ISO 8601
  memoryUsageMb: number;          // RSS in megabytes
  /** The RAM the server can use in MB: a container limit below the installed RAM, else the installed RAM. Null or absent when unknown (or an older server). */
  systemMemoryTotalMb?: number | null;
  /** The memory in use in MB: the container's usage when limited, else the machine's. Null or absent when unknown. */
  systemMemoryUsedMb?: number | null;
  /** True when `systemMemoryTotalMb` is a container limit. */
  memoryLimited?: boolean | null;
  cpuUsagePercent: number | null;  // null if unavailable
  platform: string;               // "dotnet" | "node" | "python"
  platformVersion: string;        // e.g. "8.0.1", "22.11.0", "3.12.0"
  activeWsConnections: number;
  activeShellSessions: number;
  registeredCommands: number;
  registeredJobs: number;
  os: string;                     // e.g. "linux", "win32", "darwin"
  enabledFeatures?: string[];     // e.g. ["jobs", "filesystem"]
}

// GET /api/v1/qcli/plugins
export interface PluginInfo {
  id: string;              // Module name, e.g. "@qodalis/cli-server-jobs"
  name: string;            // Display name
  version: string;
  description: string;
  author?: string | null;
  enabled: boolean;
  processorCount: number;
  processors: string[];    // Command names registered by this module
  /** One emoji, or an image URL (http(s):// or root-relative); absent on older servers. */
  icon?: string | null;
}
export type PluginsListResponse = PluginInfo[];

// GET /api/v1/qcli/plugins/installed
/** A server plugin package the host installed (users, admin, jobs, a storage provider, ...). */
export interface InstalledPluginDto {
  id: string;              // Package id, e.g. "Qodalis.Cli.Plugin.Users" or "@qodalis/cli-server-plugin-users"
  name: string;            // Short name, e.g. "Users"
  version?: string | null;
  description?: string | null;
  /** One emoji, or an image URL (http(s):// or root-relative); absent on older servers and packages without one. */
  icon?: string | null;
  /** `marketplace`: installed at runtime; `code`: added in the host's code. */
  source?: 'marketplace' | 'code';
  /** `needs-configuration`: added but waiting for required settings (it registered nothing). */
  status?: 'needs-configuration';
  /** Those settings (`<section>.<key>`) or the reason. */
  missing?: string[];
  /** The id of the plugin's settings provider on the Config page. */
  settings?: string;
}

/** A host's own values on an audit entry or a job execution (`properties`). */
export type PropertyBag = Record<string, unknown>;

// GET /api/v1/qcli/audit
export interface AuditEntryDto {
  id: string;
  timestamp: number;       // Unix time in milliseconds
  event: string;
  username: string;        // The user the event is about
  userId?: string;
  details?: string;
  actor?: string;          // Who performed the action
  actorId?: string;
  target?: string;         // What the event is about when it is not a user (group:admins, a job, ...)
  properties?: PropertyBag;
  metadata?: { remoteAddress?: string; sessionId?: string; mode?: string; tokenName?: string } & Record<string, unknown>;
}

// POST /api/v1/qcli/plugins/:id/toggle
export interface PluginToggleResponse {
  id: string;
  enabled: boolean;
}

// GET /api/v1/qcli/config: the server's config providers (issue #61). Names, labels and descriptions come from the
// server and are not translated.
export type ConfigEntryType = 'string' | 'number' | 'boolean' | 'string[]' | 'enum' | 'secret' | 'json' | 'duration' | 'url';
export type ConfigSource = 'default' | 'file' | 'environment' | 'database' | 'runtime' | 'code';
/** Where an entry's value comes from: the host's code (the default, a saved value overrides it), a saved setting, or the declared default. */
export type ConfigOrigin = 'code' | 'setting' | 'default';
export type ConfigValue = string | number | boolean | string[] | null | unknown[] | { [key: string]: unknown };

export interface ConfigValidation {
  /** Numbers: the smallest value; strings: the shortest length; lists: the fewest items; durations: milliseconds. */
  min?: number;
  max?: number;
  pattern?: string;
  options?: string[];
  required?: boolean;
}

export interface ConfigEntry {
  key: string;
  label: string;
  description: string;
  type: ConfigEntryType;
  /** Null for sensitive entries (see `isSet`). */
  value: ConfigValue;
  default: ConfigValue;
  source: ConfigSource;
  /** Servers that report it: `code` (set in the host's code, the default), `setting` (saved, overrides it), `default`. */
  origin?: ConfigOrigin;
  /** The plugin cannot run without a value (needs-configuration until it is saved). */
  required?: boolean;
  mutable: boolean;
  requiresRestart: boolean;
  sensitive: boolean;
  /** Sensitive entries: whether a value is set (it is never returned). */
  isSet?: boolean;
  validation?: ConfigValidation;
  /** A richer input than the type's (`tags`, `cron`, `code`, `origins`, ...); see the config editor registry. */
  editor?: string;
}

export interface ConfigSection {
  id: string;
  title: string;
  description: string;
  mutable: boolean;
  /** Sent back with a change; a stale one gets 409. */
  version: string | null;
  /** Keys the section does not declare may be added (free keys). */
  allowCustomKeys: boolean;
  entries: ConfigEntry[];
}

export interface ConfigProvider {
  id: string;
  title: string;
  description: string;
  order: number;
  writable: boolean;
  sections: ConfigSection[];
  /** Where the provider reads its settings from and saves changes to; older servers do not send it. */
  storage?: ConfigProviderStorage;
  /** The store this writable provider saves changes to (each provider has its own); absent on read-only providers and older servers. */
  store?: ConfigStoreDescription;
}

/** What kind of store keeps a provider's writable settings. */
export type ConfigStoreKind = 'memory' | 'file' | 'database' | 'redis' | 'custom';

/**
 * Where changes are saved (`defaultStore` of `GET /api/v1/qcli/config` and each writable provider's `store`); never
 * credentials or a connection string.
 */
export interface ConfigStoreDescription {
  kind: ConfigStoreKind;
  /** `In memory`, `JSON file`, `Database`, ... */
  title: string;
  /** `qcli-demo-config.json`, `PostgreSQL database qcli, table QcliConfig`; `''` when nothing to add. */
  detail: string;
  /** Changes are kept across restarts. */
  persistent: boolean;
}

/**
 * Where a provider's settings come from: `store` (the config store), `runtime` (the running process), `options` (the
 * server's options), `environment`, `configuration` (the host's configuration, such as .NET's IConfiguration) or `custom`.
 */
export type ConfigStorageKind = 'store' | 'runtime' | 'options' | 'environment' | 'configuration' | 'custom';

export interface ConfigProviderStorage {
  kind: ConfigStorageKind;
  description: string;
  /** The origins in the order they apply (later ones override earlier ones): `Server options`, `appsettings.json`, ... */
  sources?: string[];
}

export interface ServerConfigResponse {
  providers: ConfigProvider[];
  /** The store of providers that do not bring their own; older servers send `store` instead, or nothing. */
  defaultStore?: ConfigStoreDescription;
  /** @deprecated The single store of older servers; read as the default store. */
  store?: ConfigStoreDescription;
}

// PATCH /api/v1/qcli/config/{provider}/{section}: a null change resets a key to its default, clears a secret or
// removes a free key.
export interface UpdateConfigRequest {
  changes: Record<string, ConfigValue>;
  version?: string;
}
export interface UpdateConfigResponse {
  provider: string;
  section?: ConfigSection;
  applied: string[];
  requiresRestart: boolean;
  version: string;
}

// config:changed on the events socket
export interface ConfigChangedEvent {
  type: 'config:changed';
  provider: string;
  section: string;
  keys: string[];
  version: string;
  requiresRestart: boolean;
  user?: string;
  /** The kind of store the change was saved to; older servers do not send it. */
  store?: ConfigStoreKind;
}

// GET /api/v1/qcli/logs?level=INFO&search=error&limit=100&offset=0
export interface LogEntry {
  timestamp: string;      // ISO 8601
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  source: string;         // Logger name / module
  /** The service that wrote it (a store shared by several services, such as Seq). */
  service?: string | null;
  exception?: string | null;
}
export interface LogsResponse {
  /** Newest first. */
  entries: LogEntry[];
  /** Null when the store cannot count its entries (Seq): then see `hasMore`. */
  total: number | null;
  limit: number;
  offset: number;
  /** Servers that filter on their side (the .NET server since 1.0.0-beta.18) also send the fields below. */
  hasMore?: boolean;
  /** Where the history comes from: `memory` (this process's latest entries), `seq`, ... */
  store?: string;
  /** Whether the history outlives the process (and is worth filtering by time). */
  persistent?: boolean;
  /** The services in the store; empty when it holds only this process's entries. */
  services?: string[];
}

// GET /api/v1/qcli/ws/clients
export interface WsClientInfo {
  id: string;
  type: 'events' | 'shell';
  connectedAt: string;    // ISO 8601
  remoteAddress: string;
}
export type WsClientsResponse = WsClientInfo[];

// GET /api/v1/qcli/capabilities
export interface CapabilitiesResponse {
  os: string;
  /** true when the remote shell is enabled */
  shell: boolean | string;
  shellPath?: string;
  /** users | token | custom | anonymous | locked (when the shell is enabled) */
  shellAuth?: string;
  platform: string;
  version: string;
  features: string[];
  [key: string]: unknown;
}

// Command processor from GET /api/v1/qcli/commands
// Servers with command metadata also send aliases, examples, documentation, module, icon and allowed values;
// older servers omit them (and some keep `module` in `metadata`).
export interface CommandDescriptor {
  command: string;
  description: string;
  version?: string;
  /** Other names of the command. */
  aliases?: string[];
  /** Example command lines. */
  examples?: CommandExample[];
  /** Longer help text (paragraphs separated by a blank line). */
  documentation?: string;
  /** The group the command is listed under in help. */
  module?: string;
  /** One emoji. */
  icon?: string;
  parameters?: ParameterDescriptor[];
  processors?: CommandDescriptor[];
  /**
   * The permissions the command declares itself (absent when none). Running it also needs its parents' and, on a
   * protected server, `commands:execute`; the server repeats neither.
   */
  requiredPermissions?: string[];
  metadata?: Record<string, unknown>;
}

export interface CommandExample {
  command: string;
  description?: string;
}

export interface ParameterDescriptor {
  name: string;
  description: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  aliases?: string[];
  /** The only values the parameter takes. */
  allowedValues?: string[];
  /** Example values. */
  examples?: string[];
}

// Job types from GET /api/v1/qcli/jobs
export interface JobDto {
  id: string;
  name: string;
  description: string;
  group: string;
  /** Free-form labels to filter by (servers 1.0.0-beta.25; absent on older servers). */
  tags?: string[] | null;
  status: string;
  schedule: string | null;
  /** Milliseconds (.NET) or a duration such as "30s" (Node, Python). */
  interval: number | string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus?: string | null;
  /** Milliseconds. */
  lastRunDuration: number | null;
  /** The newest running run. */
  currentExecutionId?: string | null;
  /** Every running run, oldest first (servers 1.0.0-beta.23). */
  runningExecutionIds?: string[] | null;
  /** A run waits for a free slot (overlap policy `queue`). */
  queued?: boolean | null;
  /** Runs of the job that may go at the same time (servers 1.0.0-beta.23; absent: 1). */
  maxConcurrentRuns?: number | null;
  overlapPolicy: string;
  /** Milliseconds (.NET) or a duration such as "5m" (Node, Python). */
  timeout: number | string | null;
  maxRetries: number;
  /** Actions the job offers (`trigger`, `pause`, `resume`, `stop`, `cancel`, `update`); absent or null: all. */
  actions?: string[] | null;
  /**
   * How long the job's runs are kept (servers 1.0.0-beta.28; absent on older servers). Null: no limits, history is
   * kept forever.
   */
  historyRetention?: JobHistoryRetentionDto | null;
}

/** The effective history retention of a job: the global setting, or the job's own. */
export interface JobHistoryRetentionDto {
  /** Milliseconds (.NET) or a duration such as "30d" (Node, Python); null: no age limit. */
  maxAge: number | string | null;
  /** Runs kept per job; null: no count limit. */
  maxRunsPerJob: number | null;
  /** Like `maxAge`, for failed runs. */
  failedMaxAge: number | string | null;
  /** Like `maxRunsPerJob`, for failed runs. */
  failedMaxRunsPerJob: number | null;
  /** The job sets its own limits instead of the global ones. */
  overridden: boolean;
  /** The job keeps every run, whatever the global limits. */
  keepAll: boolean;
}

export interface JobExecutionDto {
  id: string;
  jobId: string;
  jobName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  triggerType: string;
  error: string | null;
  /** 0 for the first run, 1 for the first retry, … */
  retryAttempt?: number;
  logs: JobLogEntry[];
  /** The job's own values for this run (e.g. items, changed). */
  properties?: PropertyBag;
}

export interface JobLogEntry {
  timestamp: string;
  level: string;
  message: string;
}

/** A run as listed by `GET /jobs/executions` (no logs; `logCount` says how many there are). */
export interface JobRunDto {
  id: string;
  jobId: string;
  jobName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  /** Milliseconds. */
  duration: number | null;
  error: string | null;
  triggerType?: string | null;
  retryAttempt?: number;
  logCount?: number;
  properties?: PropertyBag;
}

export interface JobRunsResponse {
  items: JobRunDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface JobHistoryResponse {
  items: JobExecutionDto[];
  total: number;
  limit: number;
  offset: number;
}

// Filesystem types
export interface FsEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
}

// Insights endpoints (servers since 1.0.0-beta.19); durations in milliseconds, times ISO 8601

/** Runs of one column or one job, by result. */
export interface RunCounts {
  succeeded: number;
  failed: number;
  cancelled: number;
  running: number;
}

export interface RunTotals extends RunCounts {
  total: number;
  successRate: number | null;
  avgDuration: number | null;
  p95Duration: number | null;
  maxDuration: number | null;
  lastFailureAt: string | null;
}

// GET /api/v1/qcli/jobs/stats
/** One of a job's last runs in the statistics; `id` only on servers that send it (the dashboard looks it up otherwise). */
export interface RecentRunDto {
  id?: string | null;
  status: string;
  startedAt: string;
  duration: number | null;
}

export interface JobStatsResponse {
  since: string;
  until: string;
  bucketMs: number;
  buckets: (RunCounts & { start: string })[];
  totals: RunTotals;
  jobs: (RunTotals & {
    jobId: string;
    jobName: string;
    /** Newest first, at most 12. */
    recent: RecentRunDto[];
  })[];
}

// GET /api/v1/qcli/logs/histogram
export interface LogHistogramResponse {
  from: string;
  to: string;
  bucketMs: number;
  buckets: ({ start: string } & Record<'DEBUG' | 'INFO' | 'WARN' | 'ERROR', number>)[];
  totals: Record<'DEBUG' | 'INFO' | 'WARN' | 'ERROR', number>;
  store?: string;
}

// GET /api/v1/qcli/status/history
export interface StatusSample {
  timestamp: string;
  memoryMb: number;
  /** Memory in use on the machine (or in the container) in MB; null or absent when unknown (or an older server). */
  systemMemoryUsedMb?: number | null;
  /** The RAM the server can use in MB; null or absent when unknown. */
  systemMemoryTotalMb?: number | null;
  cpuPercent: number | null;
  activeWsConnections: number;
  activeShellSessions: number;
}

export interface StatusHistoryResponse {
  intervalSeconds: number;
  samples: StatusSample[];
}

// GET /api/v1/qcli/commands/stats
export interface CommandUsage {
  command: string;
  known: boolean;
  executions: number;
  failures: number;
  avgDuration: number | null;
  lastExecutedAt: string | null;
  lastFailedAt: string | null;
}

export interface CommandStatsResponse {
  since: string;
  commands: CommandUsage[];
}

// Dashboard plugins from the marketplace (`/api/v1/qcli/dashboard/marketplace`, admin plugin)
/** Who may install: listed versions of verified publishers, any listed version, or nobody (browse only). */
export type MarketplaceInstallPolicy = 'verified' | 'listed' | 'off';

// GET /dashboard/marketplace
export interface MarketplaceInfo {
  marketplaceUrl: string;
  install: MarketplaceInstallPolicy;
  /** The dashboard extension API the server offers plugins. */
  dashboardApi: number;
}

export interface MarketplacePublisher {
  name: string;
  verified: boolean;
}

/** The server plugin a dashboard plugin needs, and whether this server has it. */
export interface MarketplaceRequirement {
  serverPackage: string;
  installed: boolean;
}

/** A server package of the plugin, per platform (`node`, `dotnet`, `python`). */
export interface MarketplaceServerPackage {
  platform: string;
  name: string;
}

/** A file of a dashboard plugin's version (`dist/extension.js`), checked against its sha384 on install. */
export interface MarketplaceFile {
  path: string;
  integrity?: string;
  /** Bytes. */
  size?: number;
}

/**
 * A setting a dashboard plugin declares (`qodalis.config.entries` of its package.json, the config providers' entry
 * model without `secret`); installed, it is an entry of the `dashboard-plugins` provider's section for the plugin.
 */
export type MarketplaceConfigEntry = DashboardPluginConfigEntry;

export interface MarketplaceVersionInfo {
  version: string;
  publishedAt?: string;
  dashboardApi?: number;
  files: MarketplaceFile[];
  deprecated?: string;
  /** The version's settings; none when it declares no `qodalis.config`. */
  config?: { entries: MarketplaceConfigEntry[] };
}

/**
 * How a marketplace plugin is on this server: `marketplace`, installed from the marketplace (update and remove it
 * here); `code`, added in the host's code (its version when the server knows it): updated in code, never here.
 */
export interface MarketplaceInstalled {
  version: string | null;
  source: 'code' | 'marketplace';
}

/** A dashboard plugin of the marketplace, as this server sees it (installed, allowed, its requirement). */
export interface MarketplacePluginItem {
  /** Package name, e.g. `@qodalis/cli-dashboard-module-jobs`. */
  name: string;
  title: string;
  description: string;
  icon?: string;
  publisher: MarketplacePublisher;
  /** Latest listed version. */
  latest: string | null;
  installed: MarketplaceInstalled | null;
  /** The marketplace has a newer version (for `source: 'code'`, to update in code). */
  updateAvailable: boolean;
  /** This server's policy lets it be installed. */
  allowed: boolean;
  /** Why not: `unverified publisher`, `install disabled`, `needs dashboard API 2`. */
  blockedReason?: string;
  requires: MarketplaceRequirement | null;
}

// GET /dashboard/marketplace/plugins/{name}
export interface MarketplacePluginDetails extends MarketplacePluginItem {
  readme: string;
  /** The latest version's settings (also on that version). */
  config?: { entries: MarketplaceConfigEntry[] };
  /** Newest first. */
  versions: MarketplaceVersionInfo[];
  serverPackages: MarketplaceServerPackage[];
  homepage?: string;
  repository?: string;
  license?: string;
}

// GET /dashboard/marketplace/plugins
export interface MarketplacePage {
  items: MarketplacePluginItem[];
  total: number;
  /** 1-based. */
  page: number;
  pageSize: number;
}

// GET /dashboard/marketplace/installed
export interface MarketplaceInstalledPlugin {
  name: string;
  version: string;
  title: string;
  icon?: string;
  /** The id of its dashboard page (`/x/<id>`). */
  id: string;
  installedAt?: string;
  installedBy?: string;
  updateAvailable?: boolean;
  /** The installed version declares settings (a section of the `dashboard-plugins` config provider); absent on older servers. */
  hasConfig?: boolean;
}

// GET /api/v1/qcli/server/restart: the changes waiting for a restart and whether the server can restart itself.
/** Who restarts the process after it exits, as the server detected it; null when none was found. */
export type RestartSupervisor = 'docker' | 'systemd' | 'pm2' | 'kubernetes';
/** `exit`: exit for the supervisor to start it again; `self`: start a new process, then exit; `handler`: the host's own. */
export type RestartMode = 'exit' | 'self' | 'handler' | 'auto';

/** A change that takes effect after a restart (`config:<provider>.<section>.<key>` for config entries). */
export interface PendingRestartItem {
  id: string;
  /** What asked for it: `config`, a plugin's id, ... */
  source: string;
  /** One line, as the server words it (not translated). */
  description: string;
  /** ISO 8601. */
  since: string;
}

export interface RestartStatus {
  /** The server can restart itself (a supervisor or a configured mode); otherwise it has to be restarted by hand. */
  supported: boolean;
  mode: RestartMode | null;
  supervisor: RestartSupervisor | null;
  /** When this process started (ISO 8601): a new value means the restart happened. */
  startedAt: string | null;
  pending: PendingRestartItem[];
}

// POST /api/v1/qcli/server/restart: 202, then the server restarts
export interface RestartRequest {
  reason?: string;
}

// server:restart-required on the events socket: the pending list changed
export interface RestartRequiredEvent {
  type: 'server:restart-required';
  pending?: PendingRestartItem[];
}

// POST /dashboard/marketplace/installed, PUT /dashboard/marketplace/installed/{name}
/** What install and update send: the version (latest fitting when absent) and settings applied with it. */
export interface MarketplaceInstallOptions {
  version?: string;
  /** Settings by key, checked by the server before anything is downloaded (400 with per-key errors). */
  config?: Record<string, ConfigValue>;
}

/** The installed record, and on update the stored settings that no longer fit the new version (reset to defaults). */
export interface MarketplaceInstallResult extends Partial<MarketplaceInstalledPlugin> {
  configDropped?: string[];
}

// GET /dashboard/marketplace/installed/{name}/config
/** An installed plugin's settings: the stored values over the defaults, and the section's version. */
export interface MarketplacePluginConfigValues {
  values: Record<string, ConfigValue>;
  version: string | null;
}

// Server plugins from the marketplace (`/api/v1/qcli/server/marketplace`, admin plugin): one marketplace entry with a
// package per server platform; a server installs only its own platform's package, which runs after a restart.
/** The server platforms a server plugin may have a package for. */
export type ServerPlatform = 'node' | 'python' | 'dotnet';

// GET /server/marketplace
export interface ServerMarketplaceInfo {
  marketplaceUrl: string;
  install: MarketplaceInstallPolicy;
  /** This server's platform; null when the server does not say (then read from each plugin's own package). */
  platform: ServerPlatform | null;
  serverVersion: string | null;
  /** False when the host turned runtime server plugins off: browse only. */
  enabled: boolean;
}

/** One platform's package of a server plugin. */
export interface ServerPluginPackage {
  package: string;
  /** `npm`, `pypi`, `nuget`. */
  registry?: string;
  latest: string | null;
  /** The marketplace's install command (`npm install …`). */
  install?: string;
  /** This platform's readme (details only); absent: the plugin's own readme. */
  readme?: string;
  /** Its format, e.g. `markdown`. */
  readmeFormat?: string;
}

/** This server's package of a plugin: the newest version it can install, the installed one, whether it runs here. */
export interface ServerPluginOwnPlatform {
  package: string;
  latest: string | null;
  installed: string | null;
  compatible: boolean;
  /** Why not compatible, e.g. `needs server ^99.0.0 (this server has 1.0.0-beta.31)`. */
  reason?: string;
}

// GET /server/marketplace/plugins
export interface ServerPluginItem {
  /** The marketplace entry, e.g. `jobs`. */
  name: string;
  title: string;
  description: string;
  icon?: string;
  publisher: MarketplacePublisher;
  /** Every platform's package, by platform. */
  platforms: Partial<Record<ServerPlatform, ServerPluginPackage>>;
  /** This server's package; null when the plugin has none for this platform. */
  platform: ServerPluginOwnPlatform | null;
  otherPlatforms: string[];
  /** False when it needs the host's code: listed, never installed from here. */
  autoInstall: boolean;
  autoInstallReason?: string;
  /** Installed from the marketplace or added in code; null when the server does not have it. */
  installed: MarketplaceInstalled | null;
  /** The marketplace has a newer version (for `source: 'code'`, to update in code). */
  updateAvailable: boolean;
  allowed: boolean;
  /** `server plugins disabled`, `install disabled`, `unverified publisher`, `not available for node`, `needs setup in code`, a range's reason. */
  blockedReason?: string;
  homepage?: string;
  repository?: string;
}

export interface ServerPluginVersion {
  version: string;
  platform: string;
  package?: string;
  status?: string;
  publishedAt?: string;
  /** The range of the server core the version needs. */
  serverRange?: string;
  /** This server's versions only: whether it may be installed. */
  allowed?: boolean;
  blockedReason?: string;
}

// GET /server/marketplace/plugins/{name}
export interface ServerPluginDetails extends ServerPluginItem {
  readme: string;
  /** Every platform's versions, newest first. */
  versions: ServerPluginVersion[];
  /** The settings the plugin declares (its config provider's entries); none when it declares none. */
  config?: { entries: MarketplaceConfigEntry[] };
  license?: string;
}

export interface ServerPluginPage {
  items: ServerPluginItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * `loaded`: runs this version; `pending`: installed or updated, runs after a restart; `failed`: the last start could
 * not load it; `skipped`: the host installed the same package; `removed`: removed, running until a restart;
 * `needs-configuration`: installed without its required settings, not loaded until they are set (and a restart).
 */
export type InstalledServerPluginStatus = 'loaded' | 'pending' | 'failed' | 'skipped' | 'removed' | 'needs-configuration';

// GET /server/marketplace/installed
export interface InstalledServerPlugin {
  name: string;
  package: string;
  version: string;
  title: string;
  icon?: string;
  description?: string;
  installedAt?: string;
  installedBy?: string;
  status: InstalledServerPluginStatus;
  /** The version this process runs; null when none. */
  loadedVersion: string | null;
  /** Why it failed to load or was skipped (installed.json). */
  error?: string;
  updateAvailable?: boolean;
  /** needs-configuration: the required settings without a value (`<section>.<key>`) or the reason. */
  missing?: string[];
  /** The id of its settings provider on the Config page. */
  settings?: string;
}

// POST /server/marketplace/installed, PUT and DELETE /server/marketplace/installed/{name}: 202
export interface ServerPluginChangeResult extends Partial<InstalledServerPlugin> {
  restartRequired: boolean;
  /** Update: false (200) when it already was that version. */
  changed?: boolean;
  previousVersion?: string;
}

// GET /api/v1/qcli/notifications (docs/notifications-spec.md of the servers)
export type NotificationSeverity = 'info' | 'warning' | 'error';

export interface NotificationItem {
  id: string;
  /** The condition it is about: `update:server:weather`, `server.restart-required`, ... */
  key: string;
  /** `update`, `restart`, `plugin`, `security` or a plugin's own. */
  kind: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  /** A dashboard path (`/plugins?tab=updates`) or an absolute http(s) URL. */
  link?: string;
  createdAt: string;
  updatedAt: string;
  /** This user read it. */
  read: boolean;
}

export interface NotificationList {
  items: NotificationItem[];
  /** Every unread notification of the user, whatever the filter. */
  unreadCount: number;
}

// GET /api/v1/qcli/updates
export interface UpdateItem {
  kind: 'dashboard' | 'server' | 'core';
  /** The marketplace name (the update routes' key). */
  name: string;
  /** This server's package. */
  package: string;
  title: string;
  icon: string | null;
  current: string | null;
  latest: string | null;
  /** `marketplace`: update it here; `code`: the host updates it in code; `npm`: the server package. */
  source: 'marketplace' | 'code' | 'npm';
  updateAvailable: boolean;
  canUpdate: boolean;
  reason?: string;
  /** The install command per platform (`node`, `python`, `dotnet`). */
  install: Record<string, string>;
}

export interface UpdatesResult {
  /** Null before the first check. */
  checkedAt: string | null;
  checking: boolean;
  /** What did not answer in the last check. */
  error?: string;
  server: UpdateItem | null;
  dashboardPlugins: UpdateItem[];
  serverPlugins: UpdateItem[];
  codePlugins: UpdateItem[];
  count: number;
}
