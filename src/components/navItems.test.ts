import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, groupNavItems, navItemFor, navItems } from './navItems';

describe('groupNavItems', () => {
  it('puts every item in a section, in section order, keeping the item order within one', () => {
    const sections = groupNavItems(navItems);
    expect(sections.map(s => s.group)).toEqual([...NAV_GROUPS]);
    expect(sections.flatMap(s => s.items)).toHaveLength(navItems.length);
    expect(sections[0].items.map(i => i.path)).toEqual(['/', '/commands', '/plugins', '/terminal']);
  });

  it('leaves out sections without items', () => {
    const sections = groupNavItems(navItems.filter(i => i.group !== 'data'));
    expect(sections.map(s => s.group)).toEqual(['general', 'activity', 'settings']);
  });
});

describe('navItemFor', () => {
  it('finds the page of a path, including pages below it', () => {
    expect(navItemFor('/')?.label).toBe('nav.overview');
    expect(navItemFor('/jobs')?.label).toBe('nav.jobs');
    expect(navItemFor('/jobs/fetch-rates')?.label).toBe('nav.jobs');
    expect(navItemFor('/data-explorer/')?.label).toBe('nav.dataExplorer');
  });

  it('is null for a path no item has', () => {
    expect(navItemFor('/unknown')).toBeNull();
    expect(navItemFor('/jobsx')).toBeNull();
  });
});
