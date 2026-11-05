import { describe, expect, it } from 'vitest';
import { offers } from './jobs';

describe('offers', () => {
  it('offers every action when the server lists none', () => {
    expect(offers({}, 'stop')).toBe(true);
    expect(offers({ actions: null }, 'stop')).toBe(true);
    expect(offers(null, 'trigger')).toBe(true);
  });

  it('offers only the listed actions', () => {
    const job = { actions: ['trigger', 'pause', 'resume'] };
    expect(offers(job, 'pause')).toBe(true);
    expect(offers(job, 'stop')).toBe(false);
  });
});
