import { describe, expect, it } from 'vitest';
import { columnPath, niceScale, spreadTicks } from './chartUtils';

describe('niceScale', () => {
  it('rounds the maximum up to a clean step', () => {
    expect(niceScale(37)).toEqual({ max: 40, ticks: [0, 10, 20, 30, 40] });
    expect(niceScale(1234)).toEqual({ max: 1500, ticks: [0, 500, 1000, 1500] });
    expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] });
  });

  it('keeps whole steps for counts', () => {
    expect(niceScale(1, true)).toEqual({ max: 1, ticks: [0, 1] });
    expect(niceScale(3, true).ticks.every(Number.isInteger)).toBe(true);
    expect(niceScale(1).ticks).toContain(0.25);
  });
});

describe('spreadTicks', () => {
  it('spreads ticks and always keeps the last column', () => {
    expect(spreadTicks(24, 6)).toEqual([3, 7, 11, 15, 19, 23]);
    expect(spreadTicks(3, 6)).toEqual([0, 1, 2]);
    expect(spreadTicks(0, 6)).toEqual([]);
  });
});

describe('columnPath', () => {
  it('rounds the top only, never more than the column allows', () => {
    expect(columnPath(0, 10, 20, 30)).toBe('M0,40V14Q0,10 4,10H16Q20,10 20,14V40Z');
    expect(columnPath(0, 10, 20, 30, false)).toBe('M0,40V10Q0,10 0,10H20Q20,10 20,10V40Z');
    expect(columnPath(0, 10, 4, 1)).toBe('M0,11V11Q0,10 1,10H3Q4,10 4,11V11Z');
  });
});
