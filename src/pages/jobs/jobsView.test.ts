import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeFilterCount, parseJobsTab, wideScreen } from './jobsView';

const none = { search: '', status: 'all', group: '', tags: [] as string[], range: '24h' as const };

describe('activeFilterCount', () => {
  it('is 0 with every filter at its default', () => {
    expect(activeFilterCount(none)).toBe(0);
    expect(activeFilterCount({ ...none, search: '   ' })).toBe(0);
  });

  it('counts the search, status, group, each tag and a range other than 24h', () => {
    expect(activeFilterCount({ search: 'rates', status: 'failing', group: 'rates', tags: ['bank', 'daily'], range: '7d' })).toBe(6);
    expect(activeFilterCount({ ...none, tags: ['bank'] })).toBe(1);
    expect(activeFilterCount({ ...none, range: '1h' })).toBe(1);
  });
});

describe('wideScreen', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('follows the sm breakpoint', () => {
    vi.stubGlobal('window', { matchMedia: (q: string) => ({ matches: q === '(min-width: 640px)' }) });
    expect(wideScreen()).toBe(true);
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(wideScreen()).toBe(false);
  });

  it('is wide when the browser cannot tell', () => {
    vi.stubGlobal('window', {});
    expect(wideScreen()).toBe(true);
  });
});

describe('parseJobsTab', () => {
  it('reads the tab from the URL, the jobs list by default', () => {
    expect(parseJobsTab('runs')).toBe('runs');
    expect(parseJobsTab('jobs')).toBe('jobs');
    expect(parseJobsTab(null)).toBe('jobs');
    expect(parseJobsTab('other')).toBe('jobs');
  });
});
