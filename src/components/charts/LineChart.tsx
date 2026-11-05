import { useState } from 'react';
import { niceScale, useElementWidth } from './chartUtils';
import { ChartTooltip } from './chartParts';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  /** One value per point of `times`; null leaves a gap. */
  values: (number | null)[];
}

interface Props {
  /** Point times (ms since the epoch), oldest first. */
  times: number[];
  series: LineSeries[];
  formatValue: (value: number) => string;
  formatTime: (time: number) => string;
  /** Time axis labels. */
  formatTick: (time: number) => string;
  height?: number;
  /** Axis maximum at least this (e.g. 100 for a percentage that stays low). */
  minMax?: number;
  ariaLabel: string;
}

const AXIS_WIDTH = 44;
const AXIS_HEIGHT = 18;

/**
 * Lines over time on one axis: 2px lines, a light wash under a single series, a dot at the latest value, and a
 * crosshair that snaps to the nearest point and lists every series there.
 */
export default function LineChart({ times, series, formatValue, formatTime, formatTick, height = 120, minMax = 0, ariaLabel }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const plotWidth = Math.max(0, width - AXIS_WIDTH - 8);
  const plotHeight = height - AXIS_HEIGHT;
  const all = series.flatMap(s => s.values.filter((v): v is number => v !== null));
  const { max, ticks } = niceScale(Math.max(minMax, ...all, 0));
  const first = times[0] ?? 0;
  const last = times[times.length - 1] ?? 1;
  const span = Math.max(1, last - first);
  const x = (time: number) => AXIS_WIDTH + ((time - first) / span) * plotWidth;
  const y = (value: number) => plotHeight - (value / max) * plotHeight;

  const path = (values: (number | null)[]) => {
    let d = '';
    let pen = false;
    values.forEach((value, i) => {
      if (value === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(value).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const onPointer = (e: React.PointerEvent<SVGRectElement>) => {
    if (times.length === 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const time = first + ((e.clientX - box.left) / Math.max(1, box.width)) * span;
    let nearest = 0;
    times.forEach((t, i) => { if (Math.abs(t - time) < Math.abs(times[nearest] - time)) nearest = i; });
    setActive(nearest);
  };

  const tickTimes = times.length > 1 ? [0, 1, 2, 3].map(i => first + (span * i) / 3) : [];

  return (
    <div ref={ref} className="relative select-none" onPointerLeave={() => setActive(null)}>
      {width > 0 && times.length > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block overflow-visible">
          {ticks.map(tick => (
            <g key={tick}>
              <line x1={AXIS_WIDTH} x2={width} y1={y(tick)} y2={y(tick)} stroke="var(--qcli-border)" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={AXIS_WIDTH - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-subtle text-[10px] tabular-nums">{formatValue(tick)}</text>
            </g>
          ))}
          {tickTimes.map((time, i) => (
            <text
              key={time}
              x={x(time)} y={height - 3}
              textAnchor={i === 0 ? 'start' : i === tickTimes.length - 1 ? 'end' : 'middle'}
              className="fill-subtle text-[10px]"
            >
              {formatTick(time)}
            </text>
          ))}
          {series.length === 1 && (
            <path
              d={`${path(series[0].values)}V${plotHeight}H${x(times.find((_, i) => series[0].values[i] !== null) ?? first)}Z`}
              fill={series[0].color} opacity={0.1}
            />
          )}
          {series.map(s => (
            <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {series.map(s => {
            const i = s.values.length - 1;
            const value = s.values[i];
            return value === null || value === undefined ? null : (
              <circle key={s.key} cx={x(times[i])} cy={y(value)} r={4} fill={s.color} stroke="var(--qcli-background)" strokeWidth={2} />
            );
          })}
          {active !== null && (
            <g>
              <line x1={x(times[active])} x2={x(times[active])} y1={0} y2={plotHeight} stroke="var(--qcli-muted)" strokeWidth={1} shapeRendering="crispEdges" />
              {series.map(s => s.values[active] === null ? null : (
                <circle key={s.key} cx={x(times[active])} cy={y(s.values[active]!)} r={4} fill={s.color} stroke="var(--qcli-background)" strokeWidth={2} />
              ))}
            </g>
          )}
          <rect x={AXIS_WIDTH} y={0} width={plotWidth} height={plotHeight} fill="transparent" onPointerMove={onPointer} onPointerDown={onPointer} />
        </svg>
      )}
      {active !== null && (
        <ChartTooltip
          x={x(times[active])}
          y={Math.min(...series.map(s => (s.values[active] === null ? plotHeight : y(s.values[active]!))))}
          width={width}
          title={formatTime(times[active])}
          rows={series.map(s => ({ label: s.label, value: s.values[active] === null ? '—' : formatValue(s.values[active]!), color: s.color }))}
        />
      )}
    </div>
  );
}
