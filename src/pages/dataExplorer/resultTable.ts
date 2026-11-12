import type { DataExplorerResult } from '../../api/dataExplorer';

export interface ResultTable {
  columns: string[];
  /** One cell text per column. */
  rows: string[][];
}

/** A cell as text: `NULL` for null, JSON for objects and arrays. */
export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * A result as a table. Rows come as arrays (in the order of `columns`) or as objects (SQL providers, documents);
 * without `columns` the columns are the objects' keys in order of first appearance, and rows that are plain values
 * (a Redis reply) go in one `value` column.
 */
export function toResultTable(result: Pick<DataExplorerResult, 'columns' | 'rows'>): ResultTable {
  const rows = (Array.isArray(result.rows) ? result.rows : []) as unknown[];
  let columns = Array.isArray(result.columns) ? result.columns.map(String) : [];
  if (columns.length === 0) {
    const keys = new Set<string>();
    let scalar = false;
    for (const row of rows) {
      if (row && typeof row === 'object' && !Array.isArray(row)) Object.keys(row).forEach(k => keys.add(k));
      else if (Array.isArray(row)) row.forEach((_, i) => keys.add(String(i + 1)));
      else scalar = true;
    }
    columns = keys.size ? [...keys] : scalar ? ['value'] : [];
  }
  return {
    columns,
    rows: rows.map(row => {
      if (Array.isArray(row)) return columns.map((_, i) => formatCell(row[i]));
      if (row && typeof row === 'object') return columns.map(c => formatCell((row as Record<string, unknown>)[c]));
      return columns.map((_, i) => (i === 0 ? formatCell(row) : ''));
    }),
  };
}

/** A starting query for a table of the schema (SQL sources only), or null. */
export function tableQuery(language: string, table: string): string | null {
  if (language.toLowerCase() !== 'sql') return null;
  const name = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(table) ? table : `"${table.replace(/"/g, '""')}"`;
  return `SELECT * FROM ${name} LIMIT 100;`;
}
