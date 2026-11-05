import { describe, expect, it } from 'vitest';
import { formatSpan } from './jobs';

describe('formatSpan', () => {
  it('shows milliseconds (.NET) as the largest whole unit', () => {
    expect(formatSpan(30_000)).toBe('30s');
    expect(formatSpan(1_800_000)).toBe('30m');
    expect(formatSpan(7_200_000)).toBe('2h');
    expect(formatSpan(86_400_000)).toBe('1d');
    expect(formatSpan(90_000)).toBe('90s');
    expect(formatSpan(1500)).toBe('1.5s');
    expect(formatSpan(250)).toBe('250ms');
  });

  it('keeps duration strings (Node, Python) as they are', () => {
    expect(formatSpan('30s')).toBe('30s');
    expect(formatSpan('1h')).toBe('1h');
  });

  it('has nothing to show for a missing or invalid value', () => {
    expect(formatSpan(null)).toBeNull();
    expect(formatSpan(undefined)).toBeNull();
    expect(formatSpan('')).toBeNull();
    expect(formatSpan(-1)).toBeNull();
    expect(formatSpan(Number.NaN)).toBeNull();
  });
});
