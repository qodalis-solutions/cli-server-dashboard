import type { MessageKey } from '../i18n';

export interface NavItem {
  path: string;
  label: MessageKey;
  icon: string;
  feature?: string; // Only show if this feature is enabled
}

export const navItems: NavItem[] = [
  { path: '/', label: 'nav.overview', icon: '▣' },
  { path: '/commands', label: 'nav.commands', icon: '⌘' },
  { path: '/jobs', label: 'nav.jobs', icon: '⏱', feature: 'jobs' },
  { path: '/plugins', label: 'nav.plugins', icon: '⚙' },
  { path: '/filesystem', label: 'nav.filesystem', icon: '📁', feature: 'filesystem' },
  { path: '/data-explorer', label: 'nav.dataExplorer', icon: '⛁', feature: 'data-explorer' },
  { path: '/audit', label: 'nav.audit', icon: '🛡', feature: 'audit' },
  { path: '/tokens', label: 'nav.tokens', icon: '🔑', feature: 'tokens' },
  { path: '/events', label: 'nav.events', icon: '⚡' },
  { path: '/config', label: 'nav.config', icon: '⚙' },
  { path: '/logs', label: 'nav.logs', icon: '📜' },
  // The web CLI over the server's commands: every server has it (an OS shell is only its `ssh` command)
  { path: '/terminal', label: 'nav.terminal', icon: '>' },
];

