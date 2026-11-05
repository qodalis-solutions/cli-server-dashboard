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
export interface CommandDescriptor {
  command: string;
  description: string;
  parameters?: ParameterDescriptor[];
  processors?: CommandDescriptor[];
  metadata?: Record<string, unknown>;
}

export interface ParameterDescriptor {
  name: string;
  description: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
}

// Job types from GET /api/v1/qcli/jobs
export interface JobDto {
  id: string;
  name: string;
  description: string;
  group: string;
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
  currentExecutionId?: string | null;
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
  logs: JobLogEntry[];
  /** The job's own values for this run (e.g. items, changed). */
  properties?: PropertyBag;
}

export interface JobLogEntry {
  timestamp: string;
  level: string;
  message: string;
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
