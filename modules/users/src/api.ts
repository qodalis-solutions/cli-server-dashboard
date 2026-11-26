import { ApiError, type ExtensionApi, errorText } from '@qodalis/cli-server-dashboard-kit';

/** A user as the users plugin returns it (`/api/v1/qcli/users`). */
export interface User {
  id: string;
  name: string;
  email: string;
  /** Group names. */
  groups: string[];
  disabled: boolean;
  /** The next sign-in must set a new password (an administrator set this one). */
  mustChangePassword: boolean;
  /** Unix time in milliseconds. */
  lastLoginAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  /** `admin`, `users`: cannot be deleted. */
  builtIn: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A signed-in session (`GET /api/v1/qcli/sessions`, `sessions:read`): never its token. */
export interface Session {
  id: string;
  userId: string;
  userName: string;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  metadata: { remoteAddress?: string; userAgent?: string };
  /** The session of this dashboard. */
  current?: boolean;
}

/** The signed-in user's session (`GET /api/v1/qcli/sessions/current`). */
export interface CurrentSession {
  user: User;
  permissions: string[];
  /** The host application manages users: writes answer 501. */
  usersReadOnly: boolean;
  /** The host application manages groups: writes answer 501. */
  groupsReadOnly: boolean;
}

/** A permission the server, its plugins or the host declare (`GET /api/v1/qcli/permissions`). */
export interface CliPermission {
  name: string;
  description: string;
  group: string;
  surface: 'cli' | 'host';
}

const USERS = '/api/v1/qcli/users';
const GROUPS = '/api/v1/qcli/groups';
const SESSIONS = '/api/v1/qcli/sessions';
const user = (idOrName: string) => `${USERS}/${encodeURIComponent(idOrName)}`;
const group = (name: string) => `${GROUPS}/${encodeURIComponent(name)}`;

export const getUsers = (api: ExtensionApi) => api.get<User[]>(USERS);

export interface UserInput {
  name?: string;
  email?: string;
  groups?: string[];
  disabled?: boolean;
  /** On create only; omitted: the user has no password until one is set. */
  password?: string;
}

export const createUser = (api: ExtensionApi, input: UserInput) => api.post<User>(USERS, input);
export const updateUser = (api: ExtensionApi, id: string, input: UserInput) => api.put<User>(user(id), input);
export const deleteUser = (api: ExtensionApi, id: string) => api.del<void>(user(id));

/**
 * Sets a user's password (`users:update`); `temporary` (the server's default for someone else) makes them choose
 * their own at the next sign-in. Their sessions end.
 */
export const setPassword = (api: ExtensionApi, id: string, password: string, temporary: boolean) =>
  api.put<void>(`${user(id)}/password`, { password, temporary });

/** Changes the signed-in user's own password; the other sessions end, this one stays. */
export const changeOwnPassword = (api: ExtensionApi, id: string, currentPassword: string, password: string) =>
  api.put<void>(`${user(id)}/password`, { currentPassword, password });

/** The permissions a user holds through their groups. */
export const getUserPermissions = (api: ExtensionApi, id: string) =>
  api.get<{ userId: string; groups: string[]; permissions: string[] }>(`${user(id)}/permissions`);

export const getGroups = (api: ExtensionApi) => api.get<Group[]>(GROUPS);

export interface GroupInput {
  name?: string;
  description?: string;
  permissions?: string[];
}

export const createGroup = (api: ExtensionApi, input: GroupInput) => api.post<Group>(GROUPS, input);
export const updateGroup = (api: ExtensionApi, name: string, input: GroupInput) => api.put<Group>(group(name), input);
export const deleteGroup = (api: ExtensionApi, name: string) => api.del<void>(group(name));

export const getSessions = (api: ExtensionApi) => api.get<Session[]>(SESSIONS);
export const revokeSession = (api: ExtensionApi, id: string) => api.del<void>(`${SESSIONS}/${encodeURIComponent(id)}`);

/** Quiet: a page that cannot read it shows less, the user stays signed in. */
export const getCurrentSession = (api: ExtensionApi) => api.get<CurrentSession>(`${SESSIONS}/current`, { quiet: true });

/** The server's permissions; every catalog entry with `all` (`users:read`). Servers before 1.0.0-beta.29: 404. */
export const getPermissionCatalog = (api: ExtensionApi, all = false) =>
  api.get<CliPermission[]>(all ? '/api/v1/qcli/permissions?all=true' : '/api/v1/qcli/permissions', { quiet: true });

/** `password`: the dashboard's own sign-in; `external`: the host application signs users in (no passwords here). */
export const getAuthMode = (api: ExtensionApi) =>
  api.get<{ mode: 'password' | 'external' }>('/api/v1/qcli/auth/mode', { quiet: true });

/** The server's reason (`{ "error": "…" }`), else the message as it came. */
export function errorMessage(err: unknown): string {
  // The JSON `{ error }`, an HTML error page reduced to its text, else the message as it came
  return errorText(err);
}

/** 501: the host application manages it (read-only users or groups, external sign-in). */
export const isManagedByHost = (err: unknown) => err instanceof ApiError && err.status === 501;
