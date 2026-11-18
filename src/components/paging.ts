/** Rows per page a reader can pick. */
export const PAGE_SIZES = [20, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZES[0];

/** A stored page size, or null when it is not one of `PAGE_SIZES`. */
export function parsePageSize(value: string): number | null {
  const size = Number(value);
  return (PAGE_SIZES as readonly number[]).includes(size) ? size : null;
}

/** Pages needed for `total` rows (at least one, so an empty list still has page 1). */
export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

/** The page, moved back onto the last one when the rows shrank under it (0-based). */
export function clampPage(page: number, total: number, size: number): number {
  return Math.min(Math.max(0, page), pageCount(total, size) - 1);
}

/** The rows a page shows, 1-based for display: `from`–`to` of `total` (0–0 when there are none). */
export function pageRange(page: number, size: number, total: number): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const from = clampPage(page, total, size) * size;
  return { from: from + 1, to: Math.min(total, from + size) };
}

/** The rows of a page. */
export function pageSlice<T>(rows: readonly T[], page: number, size: number): T[] {
  const start = clampPage(page, rows.length, size) * size;
  return rows.slice(start, start + size);
}
