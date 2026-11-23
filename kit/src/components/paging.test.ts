import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, clampPage, pageCount, pageRange, pageSlice, parsePageSize } from './paging';

describe('parsePageSize', () => {
  it('accepts only the offered sizes', () => {
    expect(parsePageSize('50')).toBe(50);
    expect(parsePageSize('200')).toBe(200);
    expect(parsePageSize('33')).toBeNull();
    expect(parsePageSize('abc')).toBeNull();
    expect(DEFAULT_PAGE_SIZE).toBe(20);
  });
});

describe('pageCount / clampPage', () => {
  it('has at least one page', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(21, 20)).toBe(2);
    expect(pageCount(440, 50)).toBe(9);
  });

  it('moves back onto the last page when the rows shrink', () => {
    expect(clampPage(5, 45, 20)).toBe(2);
    expect(clampPage(-1, 45, 20)).toBe(0);
    expect(clampPage(1, 0, 20)).toBe(0);
    expect(clampPage(1, 45, 20)).toBe(1);
  });
});

describe('pageRange', () => {
  it('gives the 1-based rows a page shows', () => {
    expect(pageRange(0, 20, 45)).toEqual({ from: 1, to: 20 });
    expect(pageRange(2, 20, 45)).toEqual({ from: 41, to: 45 });
    expect(pageRange(9, 20, 45)).toEqual({ from: 41, to: 45 });
    expect(pageRange(0, 20, 0)).toEqual({ from: 0, to: 0 });
  });
});

describe('pageSlice', () => {
  it('returns the rows of the page', () => {
    const rows = Array.from({ length: 45 }, (_, i) => i);
    expect(pageSlice(rows, 0, 20)).toEqual(rows.slice(0, 20));
    expect(pageSlice(rows, 2, 20)).toEqual([40, 41, 42, 43, 44]);
    expect(pageSlice(rows, 7, 20)).toEqual([40, 41, 42, 43, 44]);
    expect(pageSlice([], 0, 20)).toEqual([]);
  });
});
