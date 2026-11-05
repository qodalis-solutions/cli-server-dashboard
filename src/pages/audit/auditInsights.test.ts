import { describe, expect, it } from 'vitest';
import type { AuditEntryDto } from '../../types';
import { auditKind, auditRangeStart, bucketAudit, matchesAuditText, topValues } from './auditInsights';

const NOW = Date.parse('2026-11-05T20:20:00.000Z');
const entry = (event: string, minutesAgo: number, extra: Partial<AuditEntryDto> = {}): AuditEntryDto => ({
  id: `${event}-${minutesAgo}`, timestamp: NOW - minutesAgo * 60_000, event, username: 'bob', ...extra,
});

describe('auditKind', () => {
  it('reads the kind from the event name', () => {
    expect(['login_failed', 'token_revoked', 'user_deleted', 'audit_cleared', 'user_created', 'login', 'password_changed'].map(auditKind))
      .toEqual(['failure', 'failure', 'removal', 'removal', 'access', 'access', 'other']);
  });
});

describe('bucketAudit', () => {
  it('counts entries per column and kind, ending after now', () => {
    const buckets = bucketAudit([entry('login', 10), entry('login_failed', 15), entry('user_deleted', 50), entry('login', 25 * 60)], '24h', NOW);
    expect(buckets).toHaveLength(24);
    expect(new Date(buckets[23].start).toISOString()).toBe('2026-11-05T20:00:00.000Z');
    expect(buckets[23].counts).toEqual({ failure: 1, removal: 0, access: 1, other: 0 });
    expect(buckets[22].counts.removal).toBe(1);
    expect(buckets.reduce((sum, b) => sum + b.total, 0)).toBe(3);
  });

  it('spans the entries themselves for all time', () => {
    const buckets = bucketAudit([entry('login', 0), entry('login', 60 * 24 * 90)], 'all', NOW);
    expect(buckets).toHaveLength(30);
    expect(buckets[0].total + buckets[29].total).toBe(2);
    expect(bucketAudit([], 'all', NOW)).toEqual([]);
    expect(auditRangeStart('all', NOW)).toBeNull();
    expect(auditRangeStart('7d', NOW)).toBe(NOW - 7 * 86_400_000);
  });
});

describe('topValues and matchesAuditText', () => {
  it('ranks the most frequent values and searches every text field', () => {
    const entries = [entry('login', 1, { actor: 'ann' }), entry('login', 2, { actor: 'ann' }), entry('x', 3, { actor: 'bob' }), entry('y', 4)];
    expect(topValues(entries, e => e.actor)).toEqual([{ value: 'ann', count: 2 }, { value: 'bob', count: 1 }]);
    expect(matchesAuditText(entry('a', 1, { details: 'Wrong Password' }), 'password')).toBe(true);
    expect(matchesAuditText(entry('a', 1, { properties: { role: 'editor' } }), 'EDITOR')).toBe(true);
    expect(matchesAuditText(entry('a', 1), 'nothing')).toBe(false);
  });
});
