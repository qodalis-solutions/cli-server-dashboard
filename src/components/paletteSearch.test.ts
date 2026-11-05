import { describe, expect, it } from 'vitest';
import { matchScore, searchPalette, type PaletteItem } from './paletteSearch';

const item = (label: string, hint?: string): PaletteItem => ({ id: label, group: 'jobs', label, hint, to: '/' });

describe('matchScore', () => {
  it('needs every character in order', () => {
    expect(matchScore('ftr', 'Fetch rates')).not.toBeNull();
    expect(matchScore('xyz', 'Fetch rates')).toBeNull();
    expect(matchScore('', 'anything')).toBe(0);
  });

  it('ranks a prefix above a later substring, and word starts above scattered letters', () => {
    expect(matchScore('log', 'Logs')!).toBeGreaterThan(matchScore('log', 'Audit log')!);
    expect(matchScore('fr', 'Fetch rates')!).toBeGreaterThan(matchScore('fr', 'Transfer')! - 1000);
  });
});

describe('searchPalette', () => {
  it('orders by score and falls back to the hint', () => {
    const items = [item('Transfer'), item('Fetch rates'), item('Cleanup', 'maintenance')];
    expect(searchPalette(items, 'fetch').map(i => i.label)).toEqual(['Fetch rates']);
    expect(searchPalette(items, 'maint').map(i => i.label)).toEqual(['Cleanup']);
    expect(searchPalette(items, '').map(i => i.label)).toEqual(['Transfer', 'Fetch rates', 'Cleanup']);
  });
});
