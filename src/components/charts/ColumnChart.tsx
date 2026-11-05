import { useState } from 'react';
import { columnPath, niceScale, useElementWidth } from './chartUtils';
import { ChartTooltip, type TooltipRow } from './chartParts';

export interface ColumnSegment {
  key: string;
  value: number;
  color: string;
}

export interface Column {
  key: string;
  /** Stacked bottom to top. */
  segments: ColumnSegment[];
  /** Tooltip heading, e.g. the time range. */
  title: string;
  rows: TooltipRow[];
  /** What a screen reader hears for the column. */
  ariaLabel: string;
}

interface Props {
  columns: Column[];
  /** Labels under some columns (by index). */
  xTicks: { index: number; label: string }[];
  formatValue: (value: number) => string;
  /** Whole-number ticks (counts). */
  integer?: boolean;
  height?: number;
  /** Column picked by click or Enter; the same one again clears it. */
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  /** Data is reloading: the previous render stays, dimmed. */
  stale?: boolean;
  ariaLabel: string;
}

const AXIS_WIDTH = 44;
const AXIS_HEIGHT = 20;
const GAP = 2;
const MAX_COLUMN = 24;
/** A segment with a value is never thinner than this, so a single failure in a busy hour stays visible. */
const MIN_SEGMENT = 2;

/** Columns from one baseline, stacked when a column has several segments; hover or focus shows a tooltip. */
export default function ColumnChart({
  columns, xTicks, formatValue, integer = false, height = 180, selectedKey = null, onSelect, stale = false, ariaLabel,
}: Props) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const plotHeight = height - AXIS_HEIGHT;
  const totals = columns.map(c => c.segments.reduce((sum, s) => sum + s.value, 0));
  const { max, ticks } = niceScale(Math.max(0, ...totals), integer);
  const slot = columns.length ? plotWidth / columns.length : 0;
  const columnWidth = Math.max(1, Math.min(MAX_COLUMN, slot - GAP));
  const y = (value: number) => plotHeight - (value / max) * plotHeight;

  const activeColumn = active !== null ? columns[active] : undefined;
  const activeTop = active !== null ? y(totals[active]) : 0;

  return (
    <div
      ref={containerRef}
      className={`relative select-none transition-opacity ${stale ? 'opacity-50' : ''}`}
      onPointerLeave={() => setActive(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} role="group" aria-label={ariaLabel} className="block overflow-visible">
          {/* Gridlines and value ticks */}
          {ticks.map(tick => (
            <g key={tick}>
              <line
                x1={AXIS_WIDTH} x2={width} y1={y(tick)} y2={y(tick)}
                stroke="var(--qcli-border)" strokeWidth={1} shapeRendering="crispEdges"
              />
              <text
                x={AXIS_WIDTH - 8} y={y(tick)} dy="0.32em" textAnchor="end"
                className="fill-subtle text-[10px] tabular-nums"
              >
                {formatValue(tick)}
              </text>
            </g>
          ))}

          {columns.map((column, i) => {
            const x = AXIS_WIDTH + i * slot + (slot - columnWidth) / 2;
            const selected = selectedKey === column.key;
            const dimmed = selectedKey !== null && !selected;
            let cursor = plotHeight;
            const drawn = column.segments.filter(s => s.value > 0);
            return (
              <g
                key={column.key}
                tabIndex={0}
                role="button"
                aria-label={column.ariaLabel}
                aria-pressed={onSelect ? selected : undefined}
                className="outline-none focus-visible:[&>rect.hit]:stroke-[var(--qcli-primary)]"
                style={{ cursor: onSelect ? 'pointer' : 'default' }}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => onSelect?.(selected ? null : column.key)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect?.(selected ? null : column.key);
                  }
                }}
              >
                {/* Hit area: the whole slot, taller and wider than the mark */}
                <rect
                  className="hit"
                  x={AXIS_WIDTH + i * slot} y={0} width={slot} height={plotHeight}
                  fill={active === i || selected ? 'var(--qcli-control)' : 'transparent'}
                  stroke="transparent" strokeWidth={1} rx={4}
                />
                {drawn.map((segment, s) => {
                  const top = s === drawn.length - 1;
                  const full = Math.max(MIN_SEGMENT, (segment.value / max) * plotHeight);
                  // Surface gap under every segment above the first
                  const h = Math.max(1, s > 0 ? full - GAP : full);
                  cursor -= full;
                  return (
                    <path
                      key={segment.key}
                      d={columnPath(x, cursor, columnWidth, h, top)}
                      fill={segment.color}
                      opacity={dimmed ? 0.35 : 1}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Baseline and time labels */}
          <line
            x1={AXIS_WIDTH} x2={width} y1={plotHeight} y2={plotHeight}
            stroke="var(--qcli-border)" strokeWidth={1} shapeRendering="crispEdges"
          />
          {xTicks.map(tick => (
            <text
              key={tick.index}
              x={AXIS_WIDTH + (tick.index + 0.5) * slot} y={height - 4} textAnchor="middle"
              className="fill-subtle text-[10px]"
            >
              {tick.label}
            </text>
          ))}
        </svg>
      )}
      {activeColumn && (
        <ChartTooltip
          x={AXIS_WIDTH + (active! + 0.5) * slot}
          y={activeTop}
          width={width}
          title={activeColumn.title}
          rows={activeColumn.rows}
        />
      )}
    </div>
  );
}
