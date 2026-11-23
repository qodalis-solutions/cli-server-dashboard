import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * The class that scopes an extension's styles: its Tailwind config sets `important: '.qcli-extension'`, so its utility
 * classes apply only inside elements carrying this class and never restyle the dashboard's own pages. The dashboard puts
 * it on every element it mounts an extension (or an Overview card) into.
 */
export const EXTENSION_SCOPE = 'qcli-extension';

let overlayScope: string | null = null;
let scopedOverlays: HTMLElement | null = null;

/** Overlays (modals, menus, selects, tooltips) of this copy of the kit go into a body-level element with this class. */
export function scopeOverlays(className: string | null): void {
  overlayScope = className;
}

/**
 * Where overlays are rendered: `document.body`, or inside an extension (`defineExtension`) a body-level element carrying
 * the scope class, so the extension's scoped styles apply to its modals and menus too.
 */
export function overlayRoot(): HTMLElement {
  if (!overlayScope) return document.body;
  if (!scopedOverlays?.isConnected) {
    scopedOverlays = document.createElement('div');
    scopedOverlays.className = overlayScope;
    scopedOverlays.dataset.qcliOverlays = '';
    document.body.appendChild(scopedOverlays);
  }
  return scopedOverlays;
}

/** Space kept between a popover and its trigger, and the edges of the window. */
const GAP = 4;
const EDGE = 8;

export interface PopoverPosition {
  left: number;
  top: number;
  /** The trigger's width; the popover is at least as wide. */
  minWidth: number;
  /** Room on the chosen side, so a long list scrolls instead of leaving the window. */
  maxHeight: number;
  placement: 'bottom' | 'top';
}

/**
 * Where a popover goes: under its trigger, or above it when there is not enough room below and more above; aligned to
 * the trigger's start (or end) and kept inside the window. Measured before paint and again on scroll and resize.
 */
export function usePopoverPosition(
  open: boolean,
  trigger: HTMLElement | null,
  panel: RefObject<HTMLElement | null>,
  align: 'start' | 'end' = 'start',
): PopoverPosition | null {
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const place = useCallback(() => {
    if (!trigger || !panel.current) return;
    const t = trigger.getBoundingClientRect();
    const p = panel.current.getBoundingClientRect();
    const below = window.innerHeight - t.bottom - GAP - EDGE;
    const above = t.top - GAP - EDGE;
    const placement = p.height > below && above > below ? 'top' : 'bottom';
    const maxHeight = Math.max(120, placement === 'bottom' ? below : above);
    const height = Math.min(p.height, maxHeight);
    const width = Math.max(p.width, t.width);
    const wanted = align === 'end' ? t.right - width : t.left;
    const left = Math.min(Math.max(EDGE, wanted), Math.max(EDGE, window.innerWidth - width - EDGE));
    const top = placement === 'bottom' ? t.bottom + GAP : t.top - GAP - height;
    setPosition(prev =>
      prev && prev.left === left && prev.top === top && prev.minWidth === t.width && prev.maxHeight === maxHeight && prev.placement === placement
        ? prev
        : { left, top, minWidth: t.width, maxHeight, placement },
    );
  }, [trigger, panel, align]);

  useLayoutEffect(() => {
    if (!open) return;
    // Measuring needs the rendered panel, so the position is set from this effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    place();
    window.addEventListener('resize', place);
    const observer = typeof ResizeObserver === 'function' && panel.current ? new ResizeObserver(place) : null;
    if (observer && panel.current) observer.observe(panel.current);
    return () => {
      window.removeEventListener('resize', place);
      observer?.disconnect();
    };
  }, [open, place, panel]);

  return open ? position : null;
}

/**
 * Closes a popover on a press outside its trigger and panel, and (when `onScroll` is given) when the page scrolls
 * under it; a scroll inside the panel itself is its own list scrolling and is ignored.
 */
export function useDismiss(
  open: boolean,
  inside: () => (Element | null)[],
  onOutside: () => void,
  onScroll?: () => void,
) {
  const insideRef = useRef(inside);
  const outsideRef = useRef(onOutside);
  const scrollRef = useRef(onScroll);
  useEffect(() => {
    insideRef.current = inside;
    outsideRef.current = onOutside;
    scrollRef.current = onScroll;
  });
  useEffect(() => {
    if (!open) return;
    const contains = (target: EventTarget | null) =>
      target instanceof Node && insideRef.current().some(el => el?.contains(target));
    const onPointer = (e: PointerEvent | MouseEvent) => { if (!contains(e.target)) outsideRef.current(); };
    const onPageScroll = (e: Event) => { if (!contains(e.target)) scrollRef.current?.(); };
    document.addEventListener('pointerdown', onPointer, true);
    // jsdom (tests) and older browsers send mousedown without pointerdown
    document.addEventListener('mousedown', onPointer, true);
    window.addEventListener('scroll', onPageScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('mousedown', onPointer, true);
      window.removeEventListener('scroll', onPageScroll, true);
    };
  }, [open]);
}

let locks = 0;
let savedOverflow = '';

/** Stops the page behind an open dialog from scrolling; nested dialogs share one lock. */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (locks++ === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    return () => {
      if (--locks === 0) document.body.style.overflow = savedOverflow;
    };
  }, [active]);
}

/** Index of the next enabled item from `from` in direction `step` (wrapping off); `from` itself when none. */
export function nextEnabled(disabled: readonly boolean[], from: number, step: 1 | -1): number {
  for (let i = from + step; i >= 0 && i < disabled.length; i += step) if (!disabled[i]) return i;
  return from;
}

export function firstEnabled(disabled: readonly boolean[]): number {
  return disabled.findIndex(d => !d);
}

export function lastEnabled(disabled: readonly boolean[]): number {
  for (let i = disabled.length - 1; i >= 0; i--) if (!disabled[i]) return i;
  return -1;
}

/**
 * Type-ahead: the typed letters (kept for half a second) jump to the next enabled item whose label starts with them,
 * after the current one; repeating one letter cycles through the items starting with it.
 */
export function useTypeahead() {
  const buffer = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback((key: string, labels: readonly string[], disabled: readonly boolean[], current: number): number => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { buffer.current = ''; }, 500);
    buffer.current += key.toLowerCase();
    const query = buffer.current;
    const repeated = query.length > 1 && [...query].every(c => c === query[0]);
    const search = repeated ? query[0] : query;
    const start = query.length === 1 || repeated ? current + 1 : current;
    for (let n = 0; n < labels.length; n++) {
      const i = (Math.max(0, start) + n) % labels.length;
      if (!disabled[i] && labels[i].toLowerCase().startsWith(search)) return i;
    }
    return current;
  }, []);
}

/** A printable key without modifiers (type-ahead), not Space. */
export function isTypeaheadKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey;
}
