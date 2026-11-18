import type { RunRange } from './jobInsights';

/** The filters of the jobs page that are set (not their default): search, status, group, each tag and the range. */
export function activeFilterCount(filters: { search: string; status: string; group: string; tags: readonly string[]; range: RunRange }): number {
  return (filters.search.trim() ? 1 : 0)
    + (filters.status !== 'all' ? 1 : 0)
    + (filters.group ? 1 : 0)
    + filters.tags.length
    + (filters.range !== '24h' ? 1 : 0);
}

/** Whether the screen is wide enough to show the filters open by default (Tailwind's `sm`). */
export function wideScreen(): boolean {
  try {
    return typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 640px)').matches;
  } catch {
    return true;
  }
}
