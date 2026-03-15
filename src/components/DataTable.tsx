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

export default function DataTable<T>({ columns, data, onRowClick, keyExtractor }: Props<T>) {
  return (
    <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {columns.map(col => (
              <th key={col.key} className={`px-4 py-3 text-left text-xs text-slate-500 font-medium uppercase tracking-wide ${col.className ?? ''}`}>
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
              className={`border-b border-white/[0.04] last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-white/[0.04]' : ''}`}
            >
              {columns.map(col => (
                <td key={col.key} className={`px-4 py-3 text-slate-300 ${col.className ?? ''}`}>
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length === 0 && (
        <div className="px-4 py-8 text-center text-slate-500 text-sm">No data</div>
      )}
    </div>
  );
}
