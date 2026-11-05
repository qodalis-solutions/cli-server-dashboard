import { describe, expect, it } from 'vitest';
import { jobUpdateFrom, type JobForm } from './jobForm';

const initial: JobForm = {
  description: 'Pulls rates', group: 'rates', timing: 'interval', schedule: '', interval: '5m',
  maxRetries: '2', timeout: '', overlapPolicy: 'skip',
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
