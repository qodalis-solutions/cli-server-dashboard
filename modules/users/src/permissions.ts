import type { CliPermission } from './api';

/** The catalog by its groups, in the server's order. */
export function groupPermissions(entries: readonly CliPermission[]): { group: string; entries: CliPermission[] }[] {
  const groups = new Map<string, CliPermission[]>();
  for (const entry of entries) {
    const list = groups.get(entry.group) ?? [];
    list.push(entry);
    groups.set(entry.group, list);
  }
  return [...groups].map(([group, list]) => ({ group, entries: list }));
}

/** Permissions typed by hand: separated by commas or white space, lower case, without duplicates. */
export function parsePermissions(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).map(p => p.trim().toLowerCase()).filter(Boolean))];
}

/** A user may change their own password here: the dashboard signs them in with one, and the server stores it. */
export const canChangePassword = (authMode: 'password' | 'external' | undefined, usersReadOnly: boolean) =>
  authMode === 'password' && !usersReadOnly;
