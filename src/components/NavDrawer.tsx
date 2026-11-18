import { useEffect, useRef, type RefObject } from 'react';
import { NavLink } from 'react-router';
import { useAuth } from '../context/AuthContext';
import AppLogo from './AppLogo';
import { useAppName } from '../hooks/useAppName';
import ConnectionStatus from './ConnectionStatus';
import LanguagePicker from './LanguagePicker';
import { useI18n } from '../i18n';
import { NAV_DRAWER_ID, NAV_GROUP_LABELS, groupNavItems } from './navItems';
import { openCommandPalette } from './commandPaletteEvents';
import { useVisibleNavItems } from '../hooks/useVisibleNavItems';
import { focusableIn, isSwipeLeft, trapFocusTarget } from './drawerGestures';

interface Props {
  open: boolean;
  /** Close it: a link was followed (the layout notices the new path), the backdrop tapped, Escape, a swipe left. */
  onClose: () => void;
  /** Focus goes back here when the drawer closes (the menu button). */
  returnFocusTo: RefObject<HTMLElement | null>;
}

/**
 * The navigation of small screens (below `lg`): an off-canvas dialog with the pages in sections. While open the page
 * behind it does not scroll and focus stays inside it.
 */
export default function NavDrawer({ open, onClose, returnFocusTo }: Props) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const appName = useAppName();
  const sections = groupNavItems(useVisibleNavItems());
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const overflow = body.style.overflow;
    body.style.overflow = 'hidden';
    focusableIn(panel.current)[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const target = trapFocusTarget(focusableIn(panel.current), document.activeElement, e.shiftKey);
        if (target) {
          e.preventDefault();
          target.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const button = returnFocusTo.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      body.style.overflow = overflow;
      button?.focus();
    };
  }, [open, returnFocusTo]);

  return (
    <div
      className={`fixed inset-0 z-40 ${open ? 'visible' : 'invisible motion-safe:delay-200'} motion-safe:transition-[visibility]`}
      aria-hidden={open ? undefined : true}
    >
      <div
        data-drawer-backdrop
        onClick={onClose}
        className={`absolute inset-0 bg-overlay motion-safe:transition-opacity motion-safe:duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        ref={panel}
        id={NAV_DRAWER_ID}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.menu')}
        onTouchStart={e => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={e => {
          const start = touchStart.current;
          touchStart.current = null;
          const end = e.changedTouches[0];
          if (start && end && isSwipeLeft(start, { x: end.clientX, y: end.clientY })) onClose();
        }}
        className={`absolute inset-y-0 left-0 w-[min(85vw,300px)] bg-sidebar border-r border-border/75 shadow-xl flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo and close */}
        <div className="pl-4 pr-2 pt-2 pb-3 border-b border-border/75">
          <div className="flex items-center gap-2 min-h-11">
            <AppLogo size={28} />
            <span className="flex-1 min-w-0 font-bold text-heading truncate">{appName}</span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('nav.closeMenu')}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-lg text-muted hover:text-text hover:bg-control transition-colors"
            >
              <span aria-hidden>✕</span>
            </button>
          </div>
          <ConnectionStatus />
        </div>

        {/* Search (Ctrl+K / ⌘K) */}
        <div className="px-2 pt-3">
          <button
            type="button"
            onClick={() => { onClose(); openCommandPalette(); }}
            className="w-full min-h-11 flex items-center gap-2 px-3 text-sm text-subtle bg-control hover:bg-control-hover rounded-lg transition-colors"
          >
            <span aria-hidden>⌕</span>
            <span className="flex-1 text-left">{t('components.paletteOpen')}</span>
          </button>
        </div>

        {/* Pages, in sections */}
        <nav aria-label={t('nav.menu')} className="flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
          {sections.map(({ group, items }) => (
            <section key={group} aria-labelledby={`nav-group-${group}`}>
              <h3 id={`nav-group-${group}`} className="px-3 pt-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-subtle">
                {t(NAV_GROUP_LABELS[group])}
              </h3>
              <ul>
                {items.map(item => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `relative min-h-11 flex items-center gap-3 px-3 rounded-lg text-[15px] transition-colors ${
                          isActive
                            ? 'bg-primary/15 text-accent font-medium before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-full before:bg-primary'
                            : 'text-muted hover:text-text hover:bg-surface'
                        }`
                      }
                    >
                      <span aria-hidden className="w-5 text-center">{item.icon}</span>
                      {t(item.label)}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        {/* User and language */}
        <div className="px-3 pt-3 pb-3 border-t border-border/75 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs text-on-primary font-medium">
              {user?.username?.[0]?.toUpperCase() ?? 'A'}
            </div>
            <div className="flex-1 min-w-0 text-sm text-text truncate">{user?.username}</div>
            <button
              type="button"
              onClick={logout}
              className="min-h-11 px-3 text-sm text-muted hover:text-text bg-control hover:bg-control-hover rounded-lg transition-colors"
            >
              {t('nav.signOut')}
            </button>
          </div>
          <LanguagePicker touch />
        </div>
      </div>
    </div>
  );
}
