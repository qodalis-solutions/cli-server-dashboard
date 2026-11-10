import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import Sidebar from '../components/Sidebar';
import ErrorBoundary from '../components/ErrorBoundary';
import CommandPalette from '../components/CommandPalette';
import AppLogo from '../components/AppLogo';
import { useAppName } from '../hooks/useAppName';
import { useI18n } from '../i18n';

export default function DashboardLayout() {
  const location = useLocation();
  const { t } = useI18n();
  const appName = useAppName();
  /**
   * On small screens the sidebar is a drawer: opened from the bar, closed by a link, the backdrop or Escape. It
   * remembers the path it was opened on, so navigating anywhere (a link, the command palette) closes it.
   */
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const menuOpen = openedOn === location.pathname;
  const closeMenu = () => setOpenedOn(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenedOn(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen">
      <Sidebar open={menuOpen} onClose={closeMenu} />
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Small screens only: the bar with the menu button (the sidebar is always shown from md up) */}
        <header className="md:hidden sticky top-0 z-20 flex items-center gap-3 h-12 px-4 bg-sidebar border-b border-border/75">
          <button
            type="button"
            onClick={() => setOpenedOn(menuOpen ? null : location.pathname)}
            aria-label={t('nav.openMenu')}
            aria-expanded={menuOpen}
            aria-controls="sidebar"
            className="w-9 h-9 -ml-2 flex items-center justify-center rounded-lg text-lg text-text hover:bg-control transition-colors"
          >
            <span aria-hidden>☰</span>
          </button>
          <AppLogo size={22} />
          <span className="font-bold text-heading truncate">{appName}</span>
        </header>
        <main className="flex-1 min-w-0 overflow-y-auto">
          {/* A page that fails keeps the sidebar usable; navigating resets it */}
          <ErrorBoundary key={location.pathname} variant="page">
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
