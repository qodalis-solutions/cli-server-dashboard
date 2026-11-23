import { useLayoutEffect, useRef, useState } from 'react';

/** Width of an element, following resizes (0 until it is laid out). */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * A column from the baseline up: 4px rounded at the data end, square at the baseline. `rounded` false gives a square
 * top (a segment under another one of a stack).
 */
export function columnPath(x: number, y: number, width: number, height: number, rounded = true): string {
  const r = rounded ? Math.min(4, width / 2, height) : 0;
  const bottom = y + height;
  return `M${x},${bottom}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${bottom}Z`;
}

/** A round axis maximum at or above `value`, with its ticks (0 and 1-4 more); `integer` keeps whole steps (counts). */
export function niceScale(value: number, integer = false): { max: number; ticks: number[] } {
  if (!(value > 0)) return { max: 1, ticks: [0, 1] };
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10]
    .map(m => m * magnitude)
    .filter(s => !integer || Number.isInteger(s))
    .find(s => value / s <= 4) ?? magnitude * 10;
  const max = Math.ceil(value / step) * step;
  const ticks: number[] = [];
  for (let tick = 0; tick <= max + step / 2; tick += step) ticks.push(Number(tick.toPrecision(12)));
  return { max, ticks };
}

/** About `count` evenly spread tick positions over `length` columns, always including the last. */
export function spreadTicks(length: number, count: number): number[] {
  if (length <= 0) return [];
  const step = Math.max(1, Math.ceil(length / count));
  const ticks: number[] = [];
  for (let i = length - 1; i >= 0; i -= step) ticks.unshift(i);
  return ticks;
}
