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
  label: MessageKey;
  icon: string;
  group: NavGroup;
  feature?: string; // Only show if this feature is enabled
}

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
