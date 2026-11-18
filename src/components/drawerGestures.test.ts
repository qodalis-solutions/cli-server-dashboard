// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SWIPE_CLOSE_DISTANCE, focusableIn, isSwipeLeft, trapFocusTarget } from './drawerGestures';

describe('trapFocusTarget', () => {
  const [a, b, c] = ['a', 'b', 'c'].map(() => document.createElement('button'));
  const items = [a, b, c];

  it('wraps from the last element to the first and back', () => {
    expect(trapFocusTarget(items, c, false)).toBe(a);
    expect(trapFocusTarget(items, a, true)).toBe(c);
  });

  it('lets the browser move focus inside the drawer', () => {
    expect(trapFocusTarget(items, a, false)).toBeNull();
    expect(trapFocusTarget(items, b, true)).toBeNull();
  });

  it('brings focus from outside into the drawer', () => {
    const outside = document.createElement('button');
    expect(trapFocusTarget(items, outside, false)).toBe(a);
    expect(trapFocusTarget(items, null, true)).toBe(c);
    expect(trapFocusTarget([], outside, false)).toBeNull();
  });
});

describe('focusableIn', () => {
  it('lists links, enabled controls and tabbable elements in order', () => {
    const root = document.createElement('div');
    root.innerHTML = '<a href="/x">x</a><button disabled>d</button><button>b</button><span tabindex="-1">s</span><select></select><div tabindex="0">t</div>';
    expect(focusableIn(root).map(el => el.tagName)).toEqual(['A', 'BUTTON', 'SELECT', 'DIV']);
    expect(focusableIn(null)).toEqual([]);
  });
});

describe('isSwipeLeft', () => {
  it('closes on a mostly horizontal move to the left of at least the distance', () => {
    expect(isSwipeLeft({ x: 200, y: 100 }, { x: 200 - SWIPE_CLOSE_DISTANCE, y: 110 })).toBe(true);
    expect(isSwipeLeft({ x: 200, y: 100 }, { x: 60, y: 100 })).toBe(true);
  });

  it('ignores short, rightward and vertical moves', () => {
    expect(isSwipeLeft({ x: 200, y: 100 }, { x: 170, y: 100 })).toBe(false);
    expect(isSwipeLeft({ x: 100, y: 100 }, { x: 250, y: 100 })).toBe(false);
    expect(isSwipeLeft({ x: 200, y: 100 }, { x: 120, y: 300 })).toBe(false);
  });
});
