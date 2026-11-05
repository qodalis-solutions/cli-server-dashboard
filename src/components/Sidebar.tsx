import { NavLink } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { useFeatures } from '../context/FeaturesContext';
import AppLogo from './AppLogo';
import { useAppName } from '../hooks/useAppName';
import ConnectionStatus from './ConnectionStatus';
import LanguagePicker from './LanguagePicker';
import { useI18n } from '../i18n';
import { navItems } from './navItems';
import { openCommandPalette } from './commandPaletteEvents';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { hasFeature, loading: featuresLoading } = useFeatures();
  const { t } = useI18n();
  const appName = useAppName();

  const visibleItems = featuresLoading
    ? navItems.filter(item => !item.feature) // While loading, show only always-visible items
    : navItems.filter(item => !item.feature || hasFeature(item.feature));

  return (
    <aside className="w-[220px] flex-shrink-0 bg-sidebar border-r border-border/75 flex flex-col h-screen sticky top-0">
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
            <span className="w-5 text-center">{item.icon}</span>
            {t(item.label)}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="px-4 py-3 border-t border-border/75 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs text-on-primary font-medium">
          {user?.username?.[0]?.toUpperCase() ?? 'A'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-text truncate">{user?.username}</div>
          <button onClick={logout} className="text-[10px] text-subtle hover:text-text">
            {t('nav.signOut')}
          </button>
        </div>
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
