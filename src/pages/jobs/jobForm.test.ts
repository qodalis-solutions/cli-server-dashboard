import { describe, expect, it } from 'vitest';
import { jobUpdateFrom, type JobForm } from './jobForm';

const initial: JobForm = {
  description: 'Pulls rates', group: 'rates', timing: 'interval', schedule: '', interval: '5m',
  maxRetries: '2', timeout: '', overlapPolicy: 'skip', maxConcurrentRuns: '1',
};

describe('jobUpdateFrom', () => {
  it('sends only what changed', () => {
    expect(jobUpdateFrom(initial, initial)).toEqual({ update: {} });
    expect(jobUpdateFrom(initial, { ...initial, interval: ' 10M ', maxRetries: '0', overlapPolicy: 'queue' }))
      .toEqual({ update: { interval: '10m', maxRetries: 0, overlapPolicy: 'queue' } });
  });

  it('sends the schedule when switching to one', () => {
    expect(jobUpdateFrom(initial, { ...initial, timing: 'schedule', schedule: ' */5  * * * * ' }))
      .toEqual({ update: { schedule: '*/5 * * * *' } });
  });

  it('names the first invalid field', () => {
    expect(jobUpdateFrom(initial, { ...initial, interval: '1.5s' })).toEqual({ error: 'jobs.invalidInterval' });
    expect(jobUpdateFrom(initial, { ...initial, interval: '0m' })).toEqual({ error: 'jobs.invalidInterval' });
    expect(jobUpdateFrom(initial, { ...initial, timing: 'schedule', schedule: '* *' })).toEqual({ error: 'jobs.invalidSchedule' });
    expect(jobUpdateFrom(initial, { ...initial, maxRetries: '-1' })).toEqual({ error: 'jobs.invalidRetries' });
    expect(jobUpdateFrom(initial, { ...initial, timeout: '5 minutes' })).toEqual({ error: 'jobs.invalidTimeout' });
  });
});

describe('jobUpdateFrom: max concurrent runs', () => {
  it('sends a changed whole number of at least 1', () => {
    expect(jobUpdateFrom(initial, { ...initial, maxConcurrentRuns: ' 3 ' })).toEqual({ update: { maxConcurrentRuns: 3 } });
  });

  it('refuses zero, fractions and an empty field', () => {
    for (const value of ['0', '-1', '1.5', '', 'two']) {
      expect(jobUpdateFrom(initial, { ...initial, maxConcurrentRuns: value })).toEqual({ error: 'jobs.invalidMaxConcurrentRuns' });
    }
  });
});
