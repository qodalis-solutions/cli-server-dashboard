import { describe, expect, it } from 'vitest';
import { eventText, eventVariant, summarizeEvent } from './eventSummary';
import { messages } from '../../i18n/messages';

/** English text of a key, with the parameters filled in (plural keys by `count`). */
function t(key: string, params: Record<string, string | number> = {}): string {
  const [ns, name] = key.split('.');
  const en = (messages as unknown as Record<string, { en: Record<string, string> }>)[ns].en;
  const template = typeof params.count === 'number' ? en[`${name}_${params.count === 1 ? 'one' : 'other'}`] : en[name];
  if (template === undefined) throw new Error(`missing ${key}`);
  return template.replace(/\{(\w+)\}/g, (_, p: string) => String(params[p]));
}

const text = (event: Record<string, unknown>) => eventText(event, t);

describe('summarizeEvent', () => {
  it('describes job events', () => {
    expect(text({ type: 'job:started', jobId: 'cleanup', executionId: 'e1' })).toBe('Job cleanup started');
    expect(text({ type: 'job:completed', jobId: 'cleanup', duration: 1520 })).toBe('Job cleanup completed in 1.5s');
    expect(text({ type: 'job:completed', jobId: 'cleanup' })).toBe('Job cleanup completed');
    expect(text({ type: 'job:failed', jobId: 'cleanup', error: 'disk full' })).toBe('Job cleanup failed: disk full');
    expect(text({ type: 'job:failed', jobId: 'cleanup' })).toBe('Job cleanup failed');
    expect(text({ type: 'job:retrying', jobId: 'sync', attempt: 2, maxRetries: 3 })).toBe('Job sync retrying (attempt 2 of 3)');
    expect(text({ type: 'job:paused', jobId: 'sync', status: 'paused' })).toBe('Job sync paused');
    expect(text({ type: 'job:updated', jobId: 'sync' })).toBe('Job sync settings changed');
    expect(text({ type: 'job:runs-deleted', jobId: 'sync', executionId: 'e1' })).toBe('A run of job sync deleted');
    expect(text({ type: 'job:runs-deleted', jobId: 'sync', count: 4 })).toBe('4 runs of job sync deleted');
    expect(text({ type: 'job:runs-deleted', jobId: 'sync', count: 1 })).toBe('1 run of job sync deleted');
  });

  it('describes users, groups, tokens and sessions', () => {
    expect(text({ type: 'user:created', userId: 'u1', username: 'ana' })).toBe('User ana created');
    expect(text({ type: 'user:deleted', userId: 'u1' })).toBe('User u1 deleted');
    expect(text({ type: 'group:updated', group: 'ops' })).toBe('Group ops updated');
    expect(text({ type: 'token:revoked', tokenId: 't1', name: 'ci', userId: 'u1' })).toBe('API token ci revoked');
    expect(text({ type: 'session:opened', userId: 'u1', username: 'ana', sessionId: 's1' })).toBe('ana signed in');
    expect(text({ type: 'session:closed', userId: 'u1', username: 'ana', sessionId: 's1' })).toBe('Session of ana ended');
  });

  it('describes files, commands and audit entries', () => {
    expect(text({ type: 'fs:changed', action: 'upload', path: '/data/a.csv' })).toBe('Uploaded /data/a.csv');
    expect(text({ type: 'fs:changed', action: 'move', path: '/a', newPath: '/b' })).toBe('Moved /a to /b');
    expect(text({ type: 'fs:changed', action: 'chmod', path: '/a' })).toBe('Changed /a');
    expect(text({ type: 'command:executed', command: 'echo', success: true, durationMs: 12 })).toBe('Ran echo (12ms)');
    expect(text({ type: 'command:executed', command: 'http', success: false, durationMs: 2500 })).toBe('Command http failed (2.5s)');
    expect(text({ type: 'audit:recorded', event: 'user.login', username: 'ana' })).toBe('Audit: user.login (ana)');
    expect(text({ type: 'audit:recorded', event: 'job.update', target: 'job:sync', actor: 'admin' })).toBe('Audit: job.update (job:sync) · by admin');
  });

  it('adds who caused the change', () => {
    expect(text({ type: 'user:updated', username: 'ana', actor: 'admin' })).toBe('User ana updated · by admin');
    expect(summarizeEvent({ type: 'job:triggered', jobId: 'a', actor: 'root' })?.actor).toBe('root');
  });

  it('describes the control messages', () => {
    expect(text({ type: 'connected' })).toBe('Connected to the server events');
    expect(text({ type: 'access-changed' })).toBe('Your permissions changed');
    expect(text({ type: 'session-kicked' })).toBe('Your session was ended');
  });

  it('leaves other types to the caller', () => {
    expect(summarizeEvent({ type: 'log:entry', message: 'x' })).toBeNull();
    expect(summarizeEvent({ type: 'job:unknown-thing', jobId: 'a' })).toBeNull();
    expect(summarizeEvent({})).toBeNull();
  });
});

describe('eventVariant', () => {
  it('colors failures, removals, additions and the rest', () => {
    expect(eventVariant('job:failed')).toBe('error');
    expect(eventVariant('job:timed_out')).toBe('error');
    expect(eventVariant('token:revoked')).toBe('warning');
    expect(eventVariant('user:deleted')).toBe('warning');
    expect(eventVariant('user:created')).toBe('success');
    expect(eventVariant('job:completed')).toBe('success');
    expect(eventVariant('fs:changed')).toBe('info');
    expect(eventVariant('log:entry')).toBe('neutral');
  });
});
