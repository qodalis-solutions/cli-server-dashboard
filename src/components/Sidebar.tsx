import { NavLink } from 'react-router';
import AppLogo from './AppLogo';
import { useAppName } from '../hooks/useAppName';
import ConnectionStatus from './ConnectionStatus';
import LanguagePicker from './LanguagePicker';
import AccountMenu from './AccountMenu';
import { useI18n } from '../i18n';
import { useVisibleNavItems } from '../hooks/useVisibleNavItems';
import { openCommandPalette } from './commandPaletteEvents';
import { navItemText } from './navItems';
import NavIcon from './NavIcon';

/** The sidebar of wide screens (from `lg` up); smaller screens open the same navigation as a drawer (NavDrawer). */
export default function Sidebar() {
  const { t } = useI18n();
  const appName = useAppName();
  const visibleItems = useVisibleNavItems();

  return (
    <aside id="sidebar" className="w-[220px] flex-shrink-0 bg-sidebar border-r border-border/75 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border/75">
        <div className="flex items-center gap-2">
          <AppLogo size={28} />
          <span className="font-bold text-heading">{appName}</span>
        </div>
        <ConnectionStatus />
      </div>

      {/* Search (Ctrl+K / ⌘K) */}
      <div className="px-2 pt-3">
        <button
          onClick={openCommandPalette}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-subtle bg-control hover:bg-control-hover rounded-lg transition-colors"
        >
          <span aria-hidden>⌕</span>
          <span className="flex-1 text-left">{t('components.paletteOpen')}</span>
          <kbd className="text-[10px] font-sans border border-border rounded px-1">{shortcutLabel()}</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {visibleItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
                isActive
                  ? 'bg-primary/15 text-accent'
                  : 'text-muted hover:text-text hover:bg-surface'
              }`
            }
          >
            <NavIcon icon={item.icon} />
            {navItemText(item, t)}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-2 py-2 border-t border-border/75">
        <AccountMenu />
      </div>
      <div className="px-4 pb-3">
        <LanguagePicker />
      </div>
    </aside>
  );
}

/** ⌘K on Apple devices, Ctrl+K elsewhere. */
function shortcutLabel(): string {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
}
