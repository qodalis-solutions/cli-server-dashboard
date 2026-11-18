import { describe, expect, it } from 'vitest';
import { jobActions } from './jobActions';

const job = (status: string, extra: { currentExecutionId?: string | null; actions?: string[] | null } = {}) => ({ status, ...extra });

describe('jobActions', () => {
  it('offers trigger, pause and stop for an active or scheduled job', () => {
    expect(jobActions(job('active'))).toEqual(['trigger', 'pause', 'stop']);
    expect(jobActions(job('scheduled'))).toEqual(['trigger', 'pause', 'stop']);
  });

  it('offers resume instead of pause for a paused job', () => {
    expect(jobActions(job('paused'))).toEqual(['trigger', 'resume', 'stop']);
  });

  it('adds cancel first while a run is going', () => {
    expect(jobActions(job('running'))).toEqual(['cancel', 'trigger', 'pause', 'stop']);
    expect(jobActions(job('active', { currentExecutionId: 'r1' }))).toEqual(['cancel', 'trigger', 'pause', 'stop']);
  });

  it('offers neither pause nor resume for a stopped job', () => {
    expect(jobActions(job('stopped'))).toEqual(['trigger', 'stop']);
  });

  it('shows only the actions the job offers', () => {
    expect(jobActions(job('active', { actions: ['trigger'] }))).toEqual(['trigger']);
    expect(jobActions(job('paused', { actions: ['pause', 'stop'] }))).toEqual(['stop']);
    expect(jobActions(job('running', { actions: ['trigger', 'stop'] }))).toEqual(['trigger', 'stop']);
    expect(jobActions(job('active', { actions: [] }))).toEqual([]);
  });
});
