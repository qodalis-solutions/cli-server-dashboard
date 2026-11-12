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

// GET /api/v1/qcli/config
export interface ServerConfigResponse {
  sections: ConfigSection[];
}
export interface ConfigSection {
  name: string;           // e.g. "cors", "filesystem", "auth", "server"
  mutable: boolean;       // Can this section be edited at runtime?
  settings: ConfigEntry[];
}
export interface ConfigEntry {
  key: string;
  value: string | number | boolean | string[];
  type: 'string' | 'number' | 'boolean' | 'string[]';
  description: string;
  mutable: boolean;       // Can this individual setting be changed?
}

// PUT /api/v1/qcli/config
export interface UpdateConfigRequest {
  section: string;
  settings: Record<string, string | number | boolean | string[]>;
}
export interface UpdateConfigResponse {
  success: boolean;
  restartRequired: boolean;  // Some settings require restart
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
    recent: { status: string; startedAt: string; duration: number | null }[];
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
