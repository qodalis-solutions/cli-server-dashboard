import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** Rendered only while the tooltip is open, so it can load what it shows on demand. */
  content: () => ReactNode;
  /**
   * The trigger: a focusable element (a link or button), given the tooltip's id for its `aria-describedby` while the
   * tooltip is open. It is wrapped in an inline element that listens for hover, focus and touch.
   */
  children: (describedBy: string | undefined) => ReactElement;
  /** Classes of the wrapping element (e.g. its hit area). */
  className?: string;
  /** Milliseconds the pointer rests on the trigger before the tooltip opens (keyboard focus opens it at once). */
  openDelay?: number;
  /** Milliseconds a finger rests on the trigger to open it on touch screens (the tap that follows is not a click). */
  longPress?: number;
}

/** Space kept between the tooltip and the trigger, and the edges of the window. */
const GAP = 8;

/**
 * A styled tooltip for a trigger: opens on hover (after `openDelay`), keyboard focus or a long press; closes when the
 * pointer leaves, focus moves on, on Escape or a tap elsewhere. Placed above the trigger (below when there is no
 * room), kept inside the window and following it when the page scrolls, rendered at the end of the page so tables
 * do not clip it.
 */
export default function Tooltip({ content, children, className = '', openDelay = 200, longPress = 450 }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [triggerEl, setTriggerEl] = useState<HTMLElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pressed = useRef(false);

  const cancel = () => clearTimeout(timer.current);
  const close = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
    setPosition(null);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Escape, or a tap outside the trigger, closes it (scrolling moves it along, see below)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onTouch = (e: TouchEvent) => { if (!triggerEl?.contains(e.target as Node)) close(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('touchstart', onTouch);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('touchstart', onTouch);
    };
  }, [open, close, triggerEl]);

  // Above the trigger, centered and kept in the window; below it when the top has no room
  const place = useCallback(() => {
    if (!triggerEl || !panel.current) return;
    const t = triggerEl.getBoundingClientRect();
    const p = panel.current.getBoundingClientRect();
    const left = Math.min(Math.max(GAP, t.left + t.width / 2 - p.width / 2), Math.max(GAP, window.innerWidth - p.width - GAP));
    const above = t.top - p.height - GAP;
    const top = above >= GAP ? above : t.bottom + GAP;
    setPosition(prev => (prev && prev.left === left && prev.top === top ? prev : { left, top }));
  }, [triggerEl]);
  // Placed before the browser paints, and again when the content grows (details loaded)
  useLayoutEffect(() => {
    if (!open) return;
    // Measuring needs the rendered panel, so the position is set from this effect
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const observer = typeof ResizeObserver === 'function' && panel.current ? new ResizeObserver(place) : null;
    if (observer && panel.current) observer.observe(panel.current);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      observer?.disconnect();
    };
  }, [open, place]);

  return (
    <>
      <span
        ref={setTriggerEl}
        className={`inline-flex ${className}`}
        onPointerEnter={e => {
          if (e.pointerType === 'touch') return;
          cancel();
          timer.current = setTimeout(() => setOpen(true), openDelay);
        }}
        onPointerLeave={e => { if (e.pointerType !== 'touch') close(); }}
        onFocus={() => { cancel(); setOpen(true); }}
        onBlur={close}
        onTouchStart={() => {
          pressed.current = false;
          cancel();
          timer.current = setTimeout(() => { pressed.current = true; setOpen(true); }, longPress);
        }}
        onTouchMove={cancel}
        onTouchEnd={cancel}
        // The tap ending a long press only showed the tooltip
        onClickCapture={e => {
          if (!pressed.current) return;
          pressed.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {children(open ? id : undefined)}
      </span>
      {open && createPortal(
        <div
          ref={panel}
          id={id}
          role="tooltip"
          style={position ? { left: position.left, top: position.top } : { left: 0, top: 0, visibility: 'hidden' }}
          className="fixed z-50 max-w-[min(20rem,calc(100vw-1rem))] px-3 py-2 rounded-lg border border-border bg-popover text-text text-xs shadow-xl pointer-events-none"
        >
          {content()}
        </div>,
        document.body,
      )}
    </>
  );
}
