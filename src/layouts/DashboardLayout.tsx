import { useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import Sidebar from '../components/Sidebar';
import NavDrawer from '../components/NavDrawer';
import ErrorBoundary from '../components/ErrorBoundary';
import CommandPalette from '../components/CommandPalette';
import AppLogo from '../components/AppLogo';
import AccountMenu from '../components/AccountMenu';
import { openCommandPalette } from '../components/commandPaletteEvents';
import { NAV_DRAWER_ID, navItemFor } from '../components/navItems';
import { useAppName } from '../hooks/useAppName';
import { DESKTOP_NAV_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { useI18n } from '../i18n';

export default function DashboardLayout() {
  const location = useLocation();
  const { t } = useI18n();
  const appName = useAppName();
  // Wide screens show the sidebar; phones and tablets a top bar whose menu button opens the navigation drawer
  const desktop = useMediaQuery(DESKTOP_NAV_QUERY, true);
  const menuButton = useRef<HTMLButtonElement>(null);
  /**
   * The drawer remembers the path it was opened on, so navigating anywhere (a link, the command palette) closes
   * it; so does growing the window to the desktop layout.
   */
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const menuOpen = !desktop && openedOn === location.pathname;
  const closeMenu = () => setOpenedOn(null);
  const page = navItemFor(location.pathname);

  return (
    <div className="flex min-h-screen">
      {desktop && <Sidebar />}
      <div className="flex-1 min-w-0 flex flex-col">
        {!desktop && (
          <header className="sticky top-0 z-20 bg-sidebar border-b border-border/75 pt-[env(safe-area-inset-top)] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
            <div className="flex items-center gap-2 h-14">
              <button
                ref={menuButton}
                type="button"
                onClick={() => setOpenedOn(menuOpen ? null : location.pathname)}
                aria-label={t('nav.openMenu')}
                aria-expanded={menuOpen}
                aria-controls={NAV_DRAWER_ID}
                aria-haspopup="dialog"
                className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-xl text-text hover:bg-control transition-colors"
              >
                <span aria-hidden>☰</span>
              </button>
              <AppLogo size={24} />
              <div className="flex-1 min-w-0 leading-tight">
                <div className="text-[11px] text-subtle truncate">{appName}</div>
                <div className="font-semibold text-heading truncate">{page ? t(page.label) : appName}</div>
              </div>
              <button
                type="button"
                onClick={openCommandPalette}
                aria-label={t('components.paletteOpen')}
                className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-muted hover:text-text hover:bg-control transition-colors"
              >
                <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>
              </button>
              <AccountMenu compact />
            </div>
          </header>
        )}
        <main className="flex-1 min-w-0 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {/* A page that fails keeps the navigation usable; navigating resets it */}
          <ErrorBoundary key={location.pathname} variant="page">
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      {!desktop && <NavDrawer open={menuOpen} onClose={closeMenu} returnFocusTo={menuButton} />}
      <CommandPalette />
    </div>
  );
}
