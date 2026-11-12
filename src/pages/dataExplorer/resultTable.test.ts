import { describe, expect, it } from 'vitest';
import { formatCell, tableQuery, toResultTable } from './resultTable';
import { toQueryOutcome } from '../../api/dataExplorer';

describe('formatCell', () => {
  it('shows NULL, JSON and plain text', () => {
    expect(formatCell(null)).toBe('NULL');
    expect(formatCell(undefined)).toBe('NULL');
    expect(formatCell({ a: 1 })).toBe('{"a":1}');
    expect(formatCell(0)).toBe('0');
    expect(formatCell(false)).toBe('false');
  });
});

describe('toResultTable', () => {
  it('keeps array rows in column order', () => {
    expect(toResultTable({ columns: ['id', 'name'], rows: [[1, 'ann'], [2, null]] })).toEqual({
      columns: ['id', 'name'],
      rows: [['1', 'ann'], ['2', 'NULL']],
    });
  });

  it('reads object rows by column, and the keys when there are no columns', () => {
    expect(toResultTable({ columns: ['name'], rows: [{ name: 'ann', id: 1 }] }).rows).toEqual([['ann']]);
    expect(toResultTable({ columns: null, rows: [{ a: 1 }, { b: 2, a: 3 }] })).toEqual({
      columns: ['a', 'b'],
      rows: [['1', 'NULL'], ['3', '2']],
    });
  });

  it('puts plain values in one column', () => {
    expect(toResultTable({ columns: null, rows: ['x', 'y'] as unknown as unknown[][] })).toEqual({
      columns: ['value'],
      rows: [['x'], ['y']],
    });
    expect(toResultTable({ columns: null, rows: [] })).toEqual({ columns: [], rows: [] });
  });
});

describe('tableQuery', () => {
  it('quotes names that need it, for SQL only', () => {
    expect(tableQuery('sql', 'users')).toBe('SELECT * FROM users LIMIT 100;');
    expect(tableQuery('sql', 'order items')).toBe('SELECT * FROM "order items" LIMIT 100;');
    expect(tableQuery('json', 'users')).toBeNull();
  });
});

describe('toQueryOutcome', () => {
  const result = { success: true, source: 's', executionTime: 3, columns: ['a'], rows: [[1]], rowCount: 1, truncated: false, error: null };

  it('returns the rows of a successful query', () => {
    expect(toQueryOutcome(200, result)).toEqual({ kind: 'rows', result });
  });

  it('reads 403 and 429 bodies (only an error) as refusals', () => {
    expect(toQueryOutcome(403, '{"error":"forbidden: missing permission data:demo"}')).toEqual({
      kind: 'refused', code: 'forbidden', message: 'forbidden: missing permission data:demo',
    });
    expect(toQueryOutcome(429, '{"error":"rate_limited: 5 queries per 60s"}')).toMatchObject({ kind: 'refused', code: 'rate_limited' });
  });

  it('reads refusals and failures in a result', () => {
    expect(toQueryOutcome(200, { ...result, success: false, error: 'read_only: writes are not allowed', errorCode: 'read_only' }))
      .toEqual({ kind: 'refused', code: 'read_only', message: 'read_only: writes are not allowed' });
    expect(toQueryOutcome(200, { ...result, success: false, error: 'no such table: x' }))
      .toEqual({ kind: 'failed', message: 'no such table: x', executionTime: 3 });
  });

  it('reads other errors as failures', () => {
    expect(toQueryOutcome(400, '{"error":"Request body must include \\"source\\""}')).toEqual({
      kind: 'failed', message: 'Request body must include "source"',
    });
    expect(toQueryOutcome(500, 'boom')).toEqual({ kind: 'failed', message: 'boom' });
    expect(toQueryOutcome(404, '{"error":"Unknown data source: \'x\'"}')).toMatchObject({ kind: 'refused', code: 'unknown_source' });
  });
});
