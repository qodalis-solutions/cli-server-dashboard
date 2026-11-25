import type { Group, Session, User } from './api';

const DAY = 86_400_000;

/** The numbers of the users page's statistics cards. */
export interface UserStats {
  users: number;
  disabled: number;
  /** Signed in within the last 7 days. */
  active: number;
  neverSignedIn: number;
  /** Created within the last 30 days. */
  created: number;
  mustChangePassword: number;
  /** Null: the groups could not be read. */
  groups: { total: number; custom: number } | null;
  /** Null: not permitted (`sessions:read`) or could not be read. */
  sessions: { total: number; users: number } | null;
}

/** Counts users, their sign-ins, groups and the unexpired sessions at `now` (Unix ms). */
export function userStats(users: readonly User[], groups: readonly Group[] | null, sessions: readonly Session[] | null, now: number): UserStats {
  const live = sessions?.filter(s => !s.expiresAt || s.expiresAt > now) ?? null;
  return {
    users: users.length,
    disabled: users.filter(u => u.disabled).length,
    active: users.filter(u => u.lastLoginAt !== undefined && u.lastLoginAt !== null && u.lastLoginAt >= now - 7 * DAY).length,
    neverSignedIn: users.filter(u => !u.lastLoginAt).length,
    created: users.filter(u => u.createdAt >= now - 30 * DAY).length,
    mustChangePassword: users.filter(u => u.mustChangePassword).length,
    groups: groups ? { total: groups.length, custom: groups.filter(g => !g.builtIn).length } : null,
    sessions: live ? { total: live.length, users: new Set(live.map(s => s.userId)).size } : null,
  };
}
