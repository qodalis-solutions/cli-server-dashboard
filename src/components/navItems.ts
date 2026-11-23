import type { DashboardExtensionInfo } from '@qodalis/cli-server-dashboard-kit';
import type { MessageKey } from '../i18n';

/** Id of the navigation drawer (the menu button's `aria-controls`). */
export const NAV_DRAWER_ID = 'nav-drawer';

/** Sections of the navigation, in order (the desktop sidebar lists the items in this order, without headings). */
export const NAV_GROUPS = ['general', 'activity', 'data', 'settings'] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export const NAV_GROUP_LABELS: Record<NavGroup, MessageKey> = {
  general: 'nav.groupGeneral',
  activity: 'nav.groupActivity',
  data: 'nav.groupData',
  settings: 'nav.groupSettings',
};

export interface NavItem {
  path: string;
  /** The dashboard's own pages: a message key. */
  label?: MessageKey;
  /** Extensions: their title in the reader's language. */
  title?: string;
  /** A character, or (extensions) an image URL. */
  icon: string;
  group: NavGroup;
  /** Place within its section (default 100), shared with the extensions' `order`. */
  order?: number;
}

/** The item's text: its translated label, or an extension's title. */
export function navItemText(item: NavItem, t: (key: MessageKey) => string): string {
  return item.label ? t(item.label) : (item.title ?? item.path);
}

/** Path of an extension's page (`/x/<id>`, docs/extensions.md). */
export const extensionPath = (id: string) => `/x/${id}`;

/** The contract's groups mapped to the drawer's sections. */
const EXTENSION_GROUPS: Record<string, NavGroup> = {
  overview: 'general',
  operations: 'activity',
  data: 'data',
  access: 'settings',
  system: 'settings',
};

/** An extension's title in `locale` (`pt-BR`, then `pt`), else its default title. */
export function extensionTitle(extension: DashboardExtensionInfo, locale: string): string {
  const titles = extension.titles ?? {};
  const base = locale.split('-')[0];
  return titles[locale] ?? titles[base] ?? extension.title;
}

/**
 * The dashboard's items and the extensions, by section (`NAV_GROUPS`), then `order` (default 100), then the
 * dashboard's own pages before extensions, in their listed and the server's order.
 */
export function withExtensions(items: readonly NavItem[], extensions: readonly DashboardExtensionInfo[], locale: string): NavItem[] {
  const extra = extensions.map((extension): NavItem => ({
    path: extensionPath(extension.id),
    title: extensionTitle(extension, locale),
    icon: extension.icon ?? '◆',
    group: EXTENSION_GROUPS[extension.group ?? 'system'] ?? 'settings',
    order: extension.order,
  }));
  return [...items, ...extra]
    .map((item, index) => ({ item, index }))
    .sort((a, b) =>
      NAV_GROUPS.indexOf(a.item.group) - NAV_GROUPS.indexOf(b.item.group)
      || (a.item.order ?? 100) - (b.item.order ?? 100)
      || a.index - b.index)
    .map(({ item }) => item);
}

/** An image icon (an extension's URL) rather than a character. */
export const isImageIcon = (icon: string) => icon.startsWith('/') || /^https?:\/\//i.test(icon);

export const navItems: NavItem[] = [
  { path: '/', label: 'nav.overview', icon: '▣', group: 'general', order: 0 },
  { path: '/commands', label: 'nav.commands', icon: '⌘', group: 'general', order: 10 },
  { path: '/plugins', label: 'nav.plugins', icon: '⚙', group: 'general', order: 20 },
  // The web CLI over the server's commands: every server has it (an OS shell is only its `ssh` command)
  { path: '/terminal', label: 'nav.terminal', icon: '>', group: 'general', order: 30 },
  // Plugins' pages (jobs 10, audit 30) come before these
  { path: '/events', label: 'nav.events', icon: '⚡', group: 'activity', order: 40 },
  { path: '/logs', label: 'nav.logs', icon: '📜', group: 'activity', order: 50 },
  { path: '/config', label: 'nav.config', icon: '⚙', group: 'settings', order: 50 },
];

/** The items by section, in `NAV_GROUPS` order, keeping their order within a section; empty sections are left out. */
export function groupNavItems(items: readonly NavItem[]): { group: NavGroup; items: NavItem[] }[] {
  return NAV_GROUPS
    .map(group => ({ group, items: items.filter(item => item.group === group) }))
    .filter(section => section.items.length > 0);
}

/** The item a path belongs to (its own page or one below it, e.g. a job under /jobs), or null. */
export function navItemFor(pathname: string, items: readonly NavItem[] = navItems): NavItem | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return items.find(item => item.path === '/') ?? null;
  return items
    .filter(item => item.path !== '/' && (path === item.path || path.startsWith(`${item.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0] ?? null;
}
