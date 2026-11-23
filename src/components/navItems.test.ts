import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, extensionTitle, groupNavItems, isImageIcon, navItemFor, navItemText, navItems, withExtensions } from './navItems';

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

describe('withExtensions', () => {
  const ext = (id: string, more: Record<string, unknown> = {}) => ({ id, title: id, entry: `/${id}.js`, ...more });

  it('adds extensions after the pages of their section, by order then server order', () => {
    const items = withExtensions(navItems, [
      ext('b', { group: 'data' }),
      ext('a', { group: 'data', order: 5 }),
      ext('c', { group: 'data' }),
      ext('ops', { group: 'operations', icon: '🧩' }),
    ], 'en');
    const data = groupNavItems(items).find(s => s.group === 'data')!.items.map(i => i.path);
    expect(data).toEqual(['/filesystem', '/data-explorer', '/x/a', '/x/b', '/x/c']);
    expect(items.find(i => i.path === '/x/ops')).toMatchObject({ group: 'activity', icon: '🧩', title: 'ops' });
  });

  it('puts extensions without a group, or with system or access, under settings', () => {
    const items = withExtensions([], [ext('n'), ext('s', { group: 'system' }), ext('acc', { group: 'access' })], 'en');
    expect(items.map(i => i.group)).toEqual(['settings', 'settings', 'settings']);
    expect(items[0].icon).toBe('◆');
  });

  it('uses the title of the reader language, then its base language, then the default', () => {
    const marketplace = ext('m', { title: 'Marketplace', titles: { de: 'Marktplatz', 'pt-BR': 'Mercado' } });
    expect(extensionTitle(marketplace, 'de')).toBe('Marktplatz');
    expect(extensionTitle(marketplace, 'pt-BR')).toBe('Mercado');
    expect(extensionTitle({ ...marketplace, titles: { pt: 'Mercado' } }, 'pt-BR')).toBe('Mercado');
    expect(extensionTitle(marketplace, 'fr')).toBe('Marketplace');
  });

  it('finds the extension page of a path below it, and reads its text', () => {
    const items = withExtensions(navItems, [ext('market', { title: 'Market' })], 'en');
    const item = navItemFor('/x/market/plugins/abc', items);
    expect(item?.path).toBe('/x/market');
    expect(navItemText(item!, () => 'never')).toBe('Market');
    expect(navItemText(navItems[0], key => `t:${key}`)).toBe('t:nav.overview');
  });

  it('tells image icons from characters', () => {
    expect(isImageIcon('/icons/a.svg')).toBe(true);
    expect(isImageIcon('https://cdn.example.com/a.png')).toBe(true);
    expect(isImageIcon('🧩')).toBe(false);
  });
});
