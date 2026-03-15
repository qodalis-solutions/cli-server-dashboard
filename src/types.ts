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
}
export interface LogsResponse {
  entries: LogEntry[];
  total: number;
  limit: number;
  offset: number;
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
  shell: string;
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
  interval: string | null;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  lastDuration: number | null;
  overlapPolicy: string;
  timeout: string | null;
  maxRetries: number;
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
}

export interface JobLogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export interface JobHistoryResponse {
  executions: JobExecutionDto[];
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
