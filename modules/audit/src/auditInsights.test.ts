import { describe, expect, it } from 'vitest';
import type { AuditEntryDto } from './types';
import { auditEntryKind, auditKind, auditRangeStart, auditStats, bucketAudit, isChange, isSignIn, matchesAuditFilters, matchesAuditText, topValues } from './auditInsights';

const NOW = Date.parse('2026-11-05T20:20:00.000Z');
const entry = (event: string, minutesAgo: number, extra: Partial<AuditEntryDto> = {}): AuditEntryDto => ({
  id: `${event}-${minutesAgo}`, timestamp: NOW - minutesAgo * 60_000, event, username: 'bob', ...extra,
});

describe('auditKind', () => {
  it('reads the kind from the event name', () => {
    expect(['login_failed', 'token_revoked', 'user_deleted', 'audit_cleared', 'user_created', 'login', 'password_changed'].map(auditKind))
      .toEqual(['failure', 'failure', 'removal', 'removal', 'access', 'access', 'other']);
  });

  it('reads link approvals and failed data queries', () => {
    expect(auditKind('link_approved')).toBe('access');
    expect(auditKind('link_denied')).toBe('failure');
    expect(auditEntryKind({ event: 'data_query', metadata: { success: false } })).toBe('failure');
    expect(auditEntryKind({ event: 'data_query', metadata: { success: true } })).toBe('other');
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

describe('matchesAuditFilters', () => {
  const entry = { id: '1', timestamp: 1, event: 'user.login', username: 'Ana', actor: 'admin' };
  it('accepts any entry without filters', () => {
    expect(matchesAuditFilters(entry, { event: '', actor: '', user: '' })).toBe(true);
  });
  it('compares event, actor and user without case', () => {
    expect(matchesAuditFilters(entry, { event: 'user.login', actor: 'ADMIN', user: 'ana' })).toBe(true);
    expect(matchesAuditFilters(entry, { event: 'user.logout', actor: '', user: '' })).toBe(false);
    expect(matchesAuditFilters(entry, { event: '', actor: 'root', user: '' })).toBe(false);
    expect(matchesAuditFilters({ ...entry, username: undefined }, { event: '', actor: '', user: 'ana' })).toBe(false);
  });
});

describe('auditStats', () => {
  it('tells sign-ins and changes by the event name', () => {
    expect(['login', 'login_failed', 'auth.signin', 'sign_in', 'logout', 'loginx', 'user_created'].map(isSignIn))
      .toEqual([true, true, true, true, false, false, false]);
    expect(['user_created', 'group_updated', 'user_deleted', 'token_revoked', 'config.update', 'role.save', 'password_changed', 'login', 'data_query', 'logout']
      .map(isChange)).toEqual([true, true, true, true, true, true, true, false, false, false]);
  });

  it('counts the events (today), the actors (the most active), the sign-ins (failed) and the changes (the most frequent)', () => {
    const midnight = new Date(NOW).setHours(0, 0, 0, 0);
    const minutesToday = Math.floor((NOW - midnight) / 60_000);
    const entries = [
      entry('login', 1, { actor: 'alice' }),
      entry('login_failed', 2, { actor: 'bob' }),
      entry('login_failed', 3, { actor: 'bob' }),
      entry('user_created', 4, { actor: 'root' }),
      entry('user_updated', 5, { actor: 'root' }),
      entry('user_updated', 6, { actor: 'root' }),
      entry('data_query', 7, { actor: 'root' }),
      entry('config.update', minutesToday + 60, { actor: 'alice' }),
      entry('logout', minutesToday + 61),
    ];
    expect(auditStats(entries, NOW)).toEqual({
      events: 9, today: 7, actors: 3, topActor: 'root', signIns: 1, failedSignIns: 2, changes: 4, topChange: 'user_updated',
    });
  });

  it('counts a failed data query as neither a sign-in nor a change', () => {
    const stats = auditStats([entry('data_query', 1, { metadata: { success: false } })], NOW);
    expect(stats).toMatchObject({ events: 1, signIns: 0, failedSignIns: 0, changes: 0 });
  });

  it('is zero without entries', () => {
    expect(auditStats([], NOW)).toEqual({
      events: 0, today: 0, actors: 0, topActor: undefined, signIns: 0, failedSignIns: 0, changes: 0, topChange: undefined,
    });
  });
});
