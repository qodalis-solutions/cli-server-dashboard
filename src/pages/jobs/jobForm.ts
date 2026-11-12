import type { JobUpdate } from '../../api/jobs';

/** The job edit form's fields, as typed. */
export interface JobForm {
  description: string;
  group: string;
  /** Comma-separated tags. */
  tags: string;
  timing: 'interval' | 'schedule';
  schedule: string;
  interval: string;
  maxRetries: string;
  timeout: string;
  overlapPolicy: string;
  maxConcurrentRuns: string;
}

/** Most tags a job may have, and the longest tag (the servers' limits). */
export const MAX_JOB_TAGS = 20;
export const MAX_JOB_TAG_LENGTH = 64;

/** Comma-separated tags as a list: trimmed, blanks and duplicates (ignoring case) dropped. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  return text.split(',').map(t => t.trim()).filter(t => {
    if (!t || seen.has(t.toLowerCase())) return false;
    seen.add(t.toLowerCase());
    return true;
  });
}

/** A duration every server parses: a whole number and a unit (s, m, h, d), e.g. "30s". */
const DURATION = /^\d+(s|m|h|d)$/;

/**
 * The fields that changed, as a `PUT /jobs/{id}` body, or the message key of the first invalid field. Changing the
 * timing sends the new schedule or interval (the server drops the other one).
 */
export function jobUpdateFrom(initial: JobForm, form: JobForm):
  { update: JobUpdate } | { error: 'jobs.invalidInterval' | 'jobs.invalidSchedule' | 'jobs.invalidRetries' | 'jobs.invalidTimeout' | 'jobs.invalidMaxConcurrentRuns' | 'jobs.invalidTags' } {
  const update: JobUpdate = {};
  if (form.description !== initial.description) update.description = form.description.trim();
  if (form.group !== initial.group) update.group = form.group.trim();
  const tags = parseTags(form.tags);
  if (tags.join(',') !== parseTags(initial.tags).join(',')) {
    if (tags.length > MAX_JOB_TAGS || tags.some(t => t.length > MAX_JOB_TAG_LENGTH)) return { error: 'jobs.invalidTags' };
    update.tags = tags.length ? tags : null;
  }

  const timingChanged = form.timing !== initial.timing;
  if (form.timing === 'interval' && (timingChanged || form.interval.trim() !== initial.interval)) {
    const interval = form.interval.replace(/\s+/g, '').toLowerCase();
    if (!DURATION.test(interval) || interval.startsWith('0')) return { error: 'jobs.invalidInterval' };
    update.interval = interval;
  }
  if (form.timing === 'schedule' && (timingChanged || form.schedule.trim() !== initial.schedule)) {
    // Cron: five or six fields; the server checks the fields themselves
    const fields = form.schedule.trim().split(/\s+/);
    if (fields.length < 5 || fields.length > 6) return { error: 'jobs.invalidSchedule' };
    update.schedule = fields.join(' ');
  }

  if (form.maxRetries !== initial.maxRetries) {
    const retries = Number(form.maxRetries);
    if (!Number.isInteger(retries) || retries < 0) return { error: 'jobs.invalidRetries' };
    update.maxRetries = retries;
  }
  if (form.timeout.trim() !== initial.timeout) {
    const timeout = form.timeout.replace(/\s+/g, '').toLowerCase();
    if (!DURATION.test(timeout)) return { error: 'jobs.invalidTimeout' };
    update.timeout = timeout;
  }
  if (form.overlapPolicy && form.overlapPolicy !== initial.overlapPolicy) update.overlapPolicy = form.overlapPolicy;
  if (form.maxConcurrentRuns.trim() !== initial.maxConcurrentRuns) {
    const max = Number(form.maxConcurrentRuns);
    if (!form.maxConcurrentRuns.trim() || !Number.isInteger(max) || max < 1) return { error: 'jobs.invalidMaxConcurrentRuns' };
    update.maxConcurrentRuns = max;
  }
  return { update };
}
