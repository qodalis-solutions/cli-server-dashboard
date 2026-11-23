export type SortValue = string | number | null | undefined;

export interface SortState {
  key: string;
  direction: 'asc' | 'desc';
}

/**
 * The rows sorted by a value: numbers by size, text by locale (numeric-aware, ignoring case); empty values stay last
 * in either direction, and equal rows keep their order.
 */
export function sortRows<T>(rows: T[], value: (row: T) => SortValue, direction: 'asc' | 'desc'): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return rows
    .map((row, index) => ({ row, index, value: value(row) }))
    .sort((a, b) => {
      const aEmpty = a.value === null || a.value === undefined || a.value === '';
      const bEmpty = b.value === null || b.value === undefined || b.value === '';
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.index - b.index : aEmpty ? 1 : -1;
      const order = typeof a.value === 'number' && typeof b.value === 'number'
        ? a.value - b.value
        : collator.compare(String(a.value), String(b.value));
      return order !== 0 ? order * sign : a.index - b.index;
    })
    .map(entry => entry.row);
}
