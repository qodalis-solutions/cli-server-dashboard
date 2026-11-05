import type { ReactNode } from 'react';

export interface LegendItem {
  label: string;
  color: string;
  value?: string;
}

/** Swatch keys in the mark's shape (a small rounded square for columns), text in text colors. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(item => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} aria-hidden />
          <span>{item.label}</span>
          {item.value !== undefined && <span className="text-text font-medium tabular-nums">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

/** The hover/focus readout: values lead, labels follow, each row keyed by a short line of the series color. */
export function ChartTooltip({ x, y, width, title, rows }: { x: number; y: number; width: number; title: string; rows: TooltipRow[] }) {
  // Keep it inside the chart: flip to the left of the mark near the right edge
  const alignRight = x > width - 120;
  const alignLeft = x < 120;
  const transform = alignRight ? 'translate(-100%, -100%)' : alignLeft ? 'translate(0, -100%)' : 'translate(-50%, -100%)';
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-[120px] rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg"
      style={{ left: x, top: y - 8, transform }}
    >
      <div className="text-subtle mb-1 whitespace-nowrap">{title}</div>
      {rows.map(row => (
        <div key={row.label} className="flex items-center gap-2 whitespace-nowrap">
          {row.color && <span className="inline-block w-3 h-0.5 rounded" style={{ background: row.color }} aria-hidden />}
          <span className="text-heading font-semibold tabular-nums">{row.value}</span>
          <span className="text-muted">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

/** The card a chart sits in: title, optional note and legend, then the plot. */
export function ChartCard({ title, note, legend, actions, children }: {
  title: string;
  note?: ReactNode;
  legend?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-heading">{title}</h3>
          {note && <div className="text-[11px] text-subtle mt-0.5">{note}</div>}
        </div>
        {actions}
      </div>
      {legend && <div className="mb-2">{legend}</div>}
      {children}
    </section>
  );
}
