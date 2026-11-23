/** Elements that can take focus in the drawer (the focus trap cycles through them). */
const FOCUSABLE = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableIn(container: HTMLElement | null): HTMLElement[] {
  return container ? Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
}

/**
 * Where Tab (or Shift+Tab) should move focus to keep it inside the drawer: from the last element to the first and
 * back, or into the drawer when focus is outside it. Null: let the browser move it.
 */
export function trapFocusTarget(items: readonly HTMLElement[], active: Element | null, backwards: boolean): HTMLElement | null {
  if (items.length === 0) return null;
  const index = active ? items.indexOf(active as HTMLElement) : -1;
  if (index === -1) return backwards ? items[items.length - 1] : items[0];
  if (backwards && index === 0) return items[items.length - 1];
  if (!backwards && index === items.length - 1) return items[0];
  return null;
}

/** Pixels a finger must travel left (and more left than up or down) to close the drawer. */
export const SWIPE_CLOSE_DISTANCE = 60;

export function isSwipeLeft(start: { x: number; y: number }, end: { x: number; y: number }): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return dx <= -SWIPE_CLOSE_DISTANCE && Math.abs(dx) > Math.abs(dy);
}
