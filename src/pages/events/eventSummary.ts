import type { MessageKey, MessageParams } from '../../i18n';
import type { ServerEvent } from '../../hooks/useLiveReload';
import { shortDuration } from '../jobs/jobInsights';

/** A one-line, translatable description of a server event: `t(key, params)`, plus who caused it when known. */
export interface EventSummary {
  key: MessageKey;
  params: MessageParams;
  actor?: string;
}

const text = (value: unknown): string | undefined =>
  (typeof value === 'string' && value !== '') || typeof value === 'number' ? String(value) : undefined;

const JOB_KEYS: Record<string, MessageKey> = {
  'job:started': 'serverEvents.jobStarted',
  'job:cancelled': 'serverEvents.jobCancelled',
  'job:timed_out': 'serverEvents.jobTimedOut',
  'job:paused': 'serverEvents.jobPaused',
  'job:resumed': 'serverEvents.jobResumed',
  'job:stopped': 'serverEvents.jobStopped',
  'job:triggered': 'serverEvents.jobTriggered',
  'job:updated': 'serverEvents.jobUpdated',
};

const SIMPLE_KEYS: Record<string, MessageKey> = {
  'user:created': 'serverEvents.userCreated',
  'user:updated': 'serverEvents.userUpdated',
  'user:deleted': 'serverEvents.userDeleted',
  'group:created': 'serverEvents.groupCreated',
  'group:updated': 'serverEvents.groupUpdated',
  'group:deleted': 'serverEvents.groupDeleted',
  'token:created': 'serverEvents.tokenCreated',
  'token:revoked': 'serverEvents.tokenRevoked',
  'session:opened': 'serverEvents.sessionOpened',
  'session:closed': 'serverEvents.sessionClosed',
  connected: 'serverEvents.connected',
  'access-changed': 'serverEvents.accessChanged',
  'session-kicked': 'serverEvents.sessionEndedSelf',
  'session-ended': 'serverEvents.sessionEndedSelf',
};

const FS_KEYS: Record<string, MessageKey> = {
  upload: 'serverEvents.fsUpload',
  mkdir: 'serverEvents.fsMkdir',
  delete: 'serverEvents.fsDelete',
  write: 'serverEvents.fsWrite',
  move: 'serverEvents.fsMove',
  copy: 'serverEvents.fsCopy',
};

function jobSummary(type: string, e: ServerEvent, job: string): EventSummary | null {
  if (JOB_KEYS[type]) return { key: JOB_KEYS[type], params: { job } };
  switch (type) {
    case 'job:completed':
      return typeof e.duration === 'number'
        ? { key: 'serverEvents.jobCompletedIn', params: { job, duration: shortDuration(e.duration) } }
        : { key: 'serverEvents.jobCompleted', params: { job } };
    case 'job:failed': {
      const error = text(e.error);
      return error ? { key: 'serverEvents.jobFailedWith', params: { job, error } } : { key: 'serverEvents.jobFailed', params: { job } };
    }
    case 'job:retrying':
      return { key: 'serverEvents.jobRetrying', params: { job, attempt: text(e.attempt) ?? '?', max: text(e.maxRetries) ?? '?' } };
    case 'job:runs-deleted':
      return typeof e.count === 'number'
        ? { key: 'serverEvents.jobRunsDeleted', params: { job, count: e.count } }
        : { key: 'serverEvents.jobRunDeleted', params: { job } };
    default:
      return null;
  }
}

/**
 * The summary of an event of the server event catalog (jobs, users, groups, tokens, sessions, files, commands, audit,
 * and the control messages), or null for any other type: callers show those as they came.
 */
export function summarizeEvent(event: ServerEvent): EventSummary | null {
  const type = typeof event.type === 'string' ? event.type : '';
  const summary = describe(type, event);
  if (!summary) return null;
  const actor = text(event.actor);
  return actor ? { ...summary, actor } : summary;
}

function describe(type: string, e: ServerEvent): EventSummary | null {
  if (type.startsWith('job:')) return jobSummary(type, e, text(e.jobName) ?? text(e.jobId) ?? '?');
  const key = SIMPLE_KEYS[type];
  if (key) {
    const user = text(e.username) ?? text(e.userId) ?? '?';
    return { key, params: { user, group: text(e.group) ?? '?', name: text(e.name) ?? text(e.tokenId) ?? '?' } };
  }
  switch (type) {
    case 'fs:changed': {
      const path = text(e.path) ?? '?';
      const action = text(e.action) ?? '';
      return { key: FS_KEYS[action] ?? 'serverEvents.fsChanged', params: { path, newPath: text(e.newPath) ?? '?' } };
    }
    case 'command:executed': {
      const params = { command: text(e.command) ?? '?', duration: shortDuration(typeof e.durationMs === 'number' ? e.durationMs : null) };
      return { key: e.success === false ? 'serverEvents.commandFailed' : 'serverEvents.commandExecuted', params };
    }
    case 'audit:recorded': {
      const auditEvent = text(e.event) ?? '?';
      const about = text(e.username) ?? text(e.target);
      return about
        ? { key: 'serverEvents.auditRecordedAbout', params: { event: auditEvent, about } }
        : { key: 'serverEvents.auditRecorded', params: { event: auditEvent } };
    }
    default:
      return null;
  }
}

/** The summary as text in the current language (with who caused it), or null for types without a summary. */
export function eventText(event: ServerEvent, t: (key: MessageKey, params?: MessageParams) => string): string | null {
  const summary = summarizeEvent(event);
  if (!summary) return null;
  const line = t(summary.key, summary.params);
  return summary.actor ? t('serverEvents.byActor', { summary: line, actor: summary.actor }) : line;
}

/** Badge color of an event type: failures red, removals amber, additions green, other jobs blue. */
export function eventVariant(type: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (/(^error:|error|fail|timed_out)/.test(type)) return 'error';
  if (/(^warn:|warn|deleted|revoked|cancelled|kicked|session-ended)/.test(type)) return 'warning';
  if (/(^connect|created|opened|:started|:completed)/.test(type)) return 'success';
  if (/^(job|fs|user|group|token|session|command|audit):/.test(type)) return 'info';
  return 'neutral';
}
