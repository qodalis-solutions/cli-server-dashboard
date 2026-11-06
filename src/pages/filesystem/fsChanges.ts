import type { ServerEvent } from '../../hooks/useLiveReload';

/** `/a/b/` and `\a\b` → `/a/b`; the root stays `/`. */
export function normalizeFsPath(path: string): string {
  const slashed = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const trimmed = slashed.length > 1 ? slashed.replace(/\/+$/, '') : slashed;
  return trimmed || '/';
}

/** The folder holding `path` (`/` for entries of the root). */
export function parentFolder(path: string): string {
  const normalized = normalizeFsPath(path);
  const slash = normalized.lastIndexOf('/');
  if (slash < 0) return '';
  return slash === 0 ? '/' : normalized.slice(0, slash);
}

/**
 * Whether an `fs:changed` event changes the listing of `folder`: an entry of it was added, changed or removed (`path`,
 * or `newPath` of a move or copy), or the folder itself or one above it was deleted or moved.
 */
export function fsChangeAffects(folder: string, event: ServerEvent): boolean {
  const shown = normalizeFsPath(folder);
  return [event.path, event.newPath]
    .filter((value): value is string => typeof value === 'string' && value !== '')
    .map(normalizeFsPath)
    .some(path => parentFolder(path) === shown || shown === path || shown.startsWith(path === '/' ? '/' : `${path}/`));
}
