import { useState } from 'react';
import ErrorBoundary from './ErrorBoundary';
import { useI18n } from '../i18n';
import { sortRows, type SortState, type SortValue } from './sortRows';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  /** Makes the column sortable by this value (empty values last in either direction). */
  sortValue?: (row: T) => SortValue;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  keyExtractor: (row: T) => string;
  /** Sort shown first; the reader can change it on sortable columns. */
  defaultSort?: SortState;
}

function DataTableContent<T>({ columns, data, onRowClick, keyExtractor, defaultSort }: Props<T>) {
  const { t } = useI18n();
  const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
  const sortColumn = sort ? columns.find(c => c.key === sort.key && c.sortValue) : undefined;
  const rows = sortColumn && sort ? sortRows(data, sortColumn.sortValue!, sort.direction) : data;

  function toggle(key: string) {
    setSort(prev => prev?.key === key
      ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' });
  }

  return (
    <div className="bg-surface border border-border rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/75">
            {columns.map(col => {
              const active = sort?.key === col.key && !!col.sortValue;
              return (
                <th
                  key={col.key}
                  aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`px-4 py-3 text-left text-xs text-subtle font-medium uppercase tracking-wide ${col.className ?? ''}`}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(col.key)}
                      title={t('common.sortBy', { column: col.header })}
                      className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-text ${active ? 'text-text' : ''}`}
                    >
                      {col.header}
                      <span aria-hidden className={`text-[9px] ${active ? '' : 'opacity-30'}`}>
                        {active && sort!.direction === 'desc' ? '▼' : '▲'}
                      </span>
                    </button>
                  ) : col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={keyExtractor(row)}
              onClick={() => onRowClick?.(row)}
              className={`border-b border-border/50 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-surface' : ''}`}
            >
              {columns.map(col => (
                <td key={col.key} className={`px-4 py-3 text-text ${col.className ?? ''}`}>
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && (
        <div className="px-4 py-8 text-center text-subtle text-sm">{t('common.noData')}</div>
      )}
    </div>
  );
}

/** A failing table shows an inline error instead of breaking the page */
export default function DataTable<T>(props: Props<T>) {
  const { t } = useI18n();
  return (
    <ErrorBoundary label={t('common.table')} resetKeys={[props.data]}>
      <DataTableContent {...props} />
    </ErrorBoundary>
  );
}
