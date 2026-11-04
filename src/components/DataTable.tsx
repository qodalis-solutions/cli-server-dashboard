import ErrorBoundary from './ErrorBoundary';
import { useI18n } from '../i18n';
interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  keyExtractor: (row: T) => string;
}

function DataTableContent<T>({ columns, data, onRowClick, keyExtractor }: Props<T>) {
  const { t } = useI18n();
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/75">
            {columns.map(col => (
              <th key={col.key} className={`px-4 py-3 text-left text-xs text-subtle font-medium uppercase tracking-wide ${col.className ?? ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
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
