import { describe, expect, it } from 'vitest';
import { DETAILED_EVENTS, auditEventDetails, isFailedEntry } from './auditEventDetails';

const format = { rows: (n: number) => `${n} rows`, ms: (n: number) => `${n} ms`, succeeded: 'ok', failed: 'failed' };

describe('auditEventDetails', () => {
  it('reads a data query', () => {
    const details = auditEventDetails({
      event: 'data_query',
      metadata: { source: 'demo-sqlite', query: 'SELECT 1', success: true, rowCount: 1, durationMs: 4, remoteAddress: '::1' },
    }, format);
    expect(details).toEqual({
      facts: [
        { label: 'source', value: 'demo-sqlite' },
        { label: 'result', value: '1 rows', tone: 'success' },
        { label: 'duration', value: '4 ms' },
      ],
      query: 'SELECT 1',
      error: undefined,
    });
  });

  it('reads a refused data query', () => {
    const details = auditEventDetails({
      event: 'data_query',
      metadata: { source: 'demo-sqlite', query: 'DELETE FROM t', success: false, rowCount: 0, durationMs: 0, error: 'read_only: writes are not allowed' },
    }, format);
    expect(details?.facts[1]).toEqual({ label: 'result', value: 'failed', tone: 'error' });
    expect(details?.error).toBe('read_only: writes are not allowed');
  });

  it('reads link approvals and denials', () => {
    expect(auditEventDetails({ event: 'link_approved', metadata: { client: 'Pixel 7', origin: 'https://cli.qodalis.com', tokenId: 't1' } }, format)?.facts)
      .toEqual([{ label: 'terminal', value: 'Pixel 7' }, { label: 'origin', value: 'https://cli.qodalis.com' }, { label: 'token', value: 't1' }]);
    expect(auditEventDetails({ event: 'link_denied', metadata: { client: 'Pixel 7' } }, format)?.facts)
      .toEqual([{ label: 'terminal', value: 'Pixel 7' }]);
  });

  it('leaves other events and missing metadata alone', () => {
    expect(auditEventDetails({ event: 'login' }, format)).toBeNull();
    expect(auditEventDetails({ event: 'data_query' }, format)).toEqual({ facts: [], query: undefined, error: undefined });
  });

  it('describes exactly the detailed events', () => {
    for (const event of DETAILED_EVENTS) expect(auditEventDetails({ event }, format)).not.toBeNull();
  });
});

describe('isFailedEntry', () => {
  it('flags failed data queries only', () => {
    expect(isFailedEntry({ event: 'data_query', metadata: { success: false } })).toBe(true);
    expect(isFailedEntry({ event: 'data_query', metadata: { success: true } })).toBe(false);
    expect(isFailedEntry({ event: 'login' })).toBe(false);
  });
});
