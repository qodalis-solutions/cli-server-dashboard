import type { DashboardExtensionInfo } from '@qodalis/cli-server-dashboard-kit';
import type { MessageKey } from '../i18n';

/** Id of the navigation drawer (the menu button's `aria-controls`). */
export const NAV_DRAWER_ID = 'nav-drawer';

/** Sections of the navigation drawer (the desktop sidebar lists the items in `navItems` order, without sections). */
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
  feature?: string; // Only show if this feature is enabled
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
 * The dashboard's items with the extensions placed in their sections: each after the section's own pages,
 * by `order` (default 100), then in the server's order.
 */
export function withExtensions(items: readonly NavItem[], extensions: readonly DashboardExtensionInfo[], locale: string): NavItem[] {
  const extra = extensions
    .map((extension, index) => ({ extension, index }))
    .sort((a, b) => (a.extension.order ?? 100) - (b.extension.order ?? 100) || a.index - b.index)
    .map(({ extension }): NavItem => ({
      path: extensionPath(extension.id),
      title: extensionTitle(extension, locale),
      icon: extension.icon ?? '◆',
      group: EXTENSION_GROUPS[extension.group ?? 'system'] ?? 'settings',
    }));
  return [...items, ...extra];
}

/** An image icon (an extension's URL) rather than a character. */
export const isImageIcon = (icon: string) => icon.startsWith('/') || /^https?:\/\//i.test(icon);

export const navItems: NavItem[] = [
  { path: '/', label: 'nav.overview', icon: '▣', group: 'general' },
  { path: '/commands', label: 'nav.commands', icon: '⌘', group: 'general' },
  { path: '/jobs', label: 'nav.jobs', icon: '⏱', group: 'activity', feature: 'jobs' },
  { path: '/plugins', label: 'nav.plugins', icon: '⚙', group: 'general' },
  { path: '/filesystem', label: 'nav.filesystem', icon: '📁', group: 'data', feature: 'filesystem' },
  { path: '/data-explorer', label: 'nav.dataExplorer', icon: '⛁', group: 'data', feature: 'data-explorer' },
  { path: '/audit', label: 'nav.audit', icon: '🛡', group: 'activity', feature: 'audit' },
  { path: '/tokens', label: 'nav.tokens', icon: '🔑', group: 'settings', feature: 'tokens' },
  { path: '/events', label: 'nav.events', icon: '⚡', group: 'activity' },
  { path: '/config', label: 'nav.config', icon: '⚙', group: 'settings' },
  { path: '/logs', label: 'nav.logs', icon: '📜', group: 'activity' },
  // The web CLI over the server's commands: every server has it (an OS shell is only its `ssh` command)
  { path: '/terminal', label: 'nav.terminal', icon: '>', group: 'general' },
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
