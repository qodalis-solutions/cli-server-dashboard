import { describe, expect, it } from 'vitest';
import { sortRows } from './sortRows';

describe('sortRows', () => {
  const rows = [{ n: 'b10', v: 3 }, { n: 'B2', v: null }, { n: 'a', v: 1 }, { n: '', v: 3 }];

  it('sorts numbers by size, keeping empty values last both ways and ties in order', () => {
    expect(sortRows(rows, r => r.v, 'asc').map(r => r.n)).toEqual(['a', 'b10', '', 'B2']);
    expect(sortRows(rows, r => r.v, 'desc').map(r => r.n)).toEqual(['b10', '', 'a', 'B2']);
  });

  it('sorts text numeric-aware, ignoring case', () => {
    expect(sortRows(rows, r => r.n, 'asc').map(r => r.n)).toEqual(['a', 'B2', 'b10', '']);
  });
});
