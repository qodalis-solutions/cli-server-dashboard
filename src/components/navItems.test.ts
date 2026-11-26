import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, extensionTitle, groupNavItems, isImageIcon, navItemFor, navItemText, navItems, permittedNavItems, withExtensions } from './navItems';

describe('groupNavItems', () => {
  it('puts every item in a section, in section order, keeping the item order within one', () => {
    const sections = groupNavItems(navItems);
    // The dashboard's own pages have no data section: that is plugins' (files, data explorer, databases)
    expect(sections.map(s => s.group)).toEqual(NAV_GROUPS.filter(g => g !== 'data'));
    expect(sections.flatMap(s => s.items)).toHaveLength(navItems.length);
    expect(sections[0].items.map(i => i.path)).toEqual(['/', '/commands', '/plugins', '/terminal']);
  });

  it('leaves out sections without items', () => {
    const sections = groupNavItems(navItems.filter(i => i.group !== 'activity'));
    expect(sections.map(s => s.group)).toEqual(['general', 'settings']);
  });
});

describe('navItemFor', () => {
  it('finds the page of a path, including pages below it', () => {
    expect(navItemFor('/')?.label).toBe('nav.overview');
    expect(navItemFor('/logs')?.label).toBe('nav.logs');
    expect(navItemFor('/logs/')?.label).toBe('nav.logs');
    expect(navItemFor('/commands/echo')?.label).toBe('nav.commands');
  });

  it('is null for a path no item has', () => {
    expect(navItemFor('/unknown')).toBeNull();
    expect(navItemFor('/logsx')).toBeNull();
  });
});

describe('withExtensions', () => {
  const ext = (id: string, more: Record<string, unknown> = {}) => ({ id, title: id, entry: `/${id}.js`, ...more });

  it('places extensions in their section by order, then the server order, the own pages first on a tie', () => {
    const items = withExtensions(navItems, [
      ext('b', { group: 'data' }),
      ext('a', { group: 'data', order: 5 }),
      ext('c', { group: 'data' }),
      ext('jobs', { group: 'operations', order: 10, icon: '⏱' }),
      ext('audit', { group: 'operations', order: 30 }),
      ext('late', { group: 'operations' }),
      ext('tokens', { group: 'access', order: 10 }),
    ], 'en');
    const section = (group: string) => groupNavItems(items).find(s => s.group === group)!.items.map(i => i.path);
    expect(section('data')).toEqual(['/x/a', '/x/b', '/x/c']);
    expect(section('activity')).toEqual(['/x/jobs', '/x/audit', '/events', '/logs', '/x/late']);
    expect(section('settings')).toEqual(['/x/tokens', '/config']);
    expect(items.find(i => i.path === '/x/jobs')).toMatchObject({ group: 'activity', icon: '⏱', title: 'jobs' });
    // The sidebar's flat list follows the sections
    expect(items.map(i => i.group)).toEqual([...items.map(i => i.group)].sort((x, y) => NAV_GROUPS.indexOf(x) - NAV_GROUPS.indexOf(y)));
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

describe('permittedNavItems', () => {
  const paths = (permissions: string[]) => permittedNavItems(navItems, permissions).map(i => i.path);

  it('gates the pages whose data needs more than admin:access', () => {
    expect(navItems.filter(i => i.permission).map(i => [i.path, i.permission])).toEqual([
      ['/terminal', 'commands:execute'], ['/logs', 'logs:read'], ['/config', 'config:read'],
    ]);
  });

  it('keeps the pages the permissions allow, wildcards included', () => {
    expect(paths(['admin:access'])).toEqual(['/', '/commands', '/plugins', '/events']);
    expect(paths(['admin:access', 'config:read'])).toEqual(['/', '/commands', '/plugins', '/events', '/config']);
    expect(paths(['logs:*', 'commands:execute'])).toEqual(['/', '/commands', '/plugins', '/terminal', '/events', '/logs']);
    expect(paths(['*'])).toEqual(navItems.map(i => i.path));
  });
});
