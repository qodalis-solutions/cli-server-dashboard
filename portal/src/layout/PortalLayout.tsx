import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { DESKTOP_NAV_QUERY, useMediaQuery } from '@dashboard/hooks/useMediaQuery';
import { focusableIn, isSwipeLeft, trapFocusTarget } from '@dashboard/components/drawerGestures';
import { usePortal } from '../PortalContext';
import { applyPortalTheme, currentScheme, saveScheme } from '../theme';
import ErrorBoundary from '../components/ErrorBoundary';
import SideNav from './SideNav';

const DRAWER_ID = 'qp-nav-drawer';

/**
 * The portal's frame: a header (logo, name, sections, theme toggle), the navigation (a sidebar from `lg` up, a
 * drawer on phones and tablets), the page, and the footer links.
 */
export default function PortalLayout() {
  const { config } = usePortal();
  const location = useLocation();
  const desktop = useMediaQuery(DESKTOP_NAV_QUERY, true);
  const menuButton = useRef<HTMLButtonElement>(null);
  // The drawer remembers the navigation it was opened on, so following any link (an #anchor too) closes it
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const menuOpen = !desktop && openedOn === location.key;

  // A new page starts at the top (an #anchor scrolls to its heading instead)
  useEffect(() => {
    if (!location.hash) document.documentElement.scrollTop = 0;
  }, [location.pathname, location.hash]);

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#qp-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:rounded-md focus:bg-primary focus:text-on-primary">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-border bg-sidebar/90 backdrop-blur supports-[backdrop-filter]:bg-sidebar/75 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-[90rem] h-14 flex items-center gap-2 px-2 sm:px-4 lg:px-6">
          {!desktop && (
            <button
              ref={menuButton}
              type="button"
              onClick={() => setOpenedOn(menuOpen ? null : location.key)}
              aria-label="Open the navigation"
              aria-expanded={menuOpen}
              aria-controls={DRAWER_ID}
              aria-haspopup="dialog"
              className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-xl text-text hover:bg-control transition-colors"
            >
              <span aria-hidden>☰</span>
            </button>
          )}
          <Link to="/" className="flex items-center gap-2.5 min-w-0 rounded-md pr-2">
            <SiteLogo logo={config.logo} name={config.name} />
            <span className="font-semibold text-heading truncate">{config.name}</span>
          </Link>
          <div className="flex-1" />
          {(config.docs || config.api) && (
            <nav aria-label="Sections" className="hidden sm:flex items-center gap-1 text-sm">
              {config.docs && <HeaderLink to="/" active={!location.pathname.startsWith('/reference')}>{config.docs.title}</HeaderLink>}
              {config.api && <HeaderLink to="/reference" active={location.pathname.startsWith('/reference')}>{config.api.title}</HeaderLink>}
            </nav>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="flex-1 w-full mx-auto max-w-[90rem] flex">
        {desktop && (
          <aside className="w-72 shrink-0 border-r border-border">
            <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto overscroll-contain">
              <SideNav />
            </div>
          </aside>
        )}
        <main id="qp-content" className="flex-1 min-w-0 px-4 sm:px-8 lg:px-12 py-8 sm:py-10">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <footer className="border-t border-border pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-[90rem] px-4 sm:px-8 lg:px-12 py-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 text-sm text-muted">
          <span className="text-subtle">{config.name}</span>
          {config.footerLinks.length > 0 && (
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {config.footerLinks.map(link => (
                <li key={`${link.label}\n${link.url}`}>
                  <a
                    href={link.url}
                    className="hover:text-text hover:underline"
                    {...(/^https?:/i.test(link.url) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </footer>

      {!desktop && (
        <Drawer open={menuOpen} onClose={() => setOpenedOn(null)} returnFocusTo={menuButton} title={config.name}>
          <SideNav />
        </Drawer>
      )}
    </div>
  );
}

function HeaderLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`px-3 py-1.5 rounded-md transition-colors ${active ? 'text-heading bg-control' : 'text-muted hover:text-text hover:bg-control'}`}
    >
      {children}
    </Link>
  );
}

function SiteLogo({ logo, name }: { logo: string | null; name: string }) {
  if (logo) return <img src={logo} alt={name} className="h-7 w-auto max-w-[8rem] object-contain" />;
  return (
    <svg aria-hidden width="28" height="28" viewBox="0 0 32 32" className="shrink-0">
      <rect x="2" y="2" width="28" height="28" rx="7" fill="var(--qcli-primary)" />
      <path d="M9 9.5c2.6-.9 5-.6 7 1 2-1.6 4.4-1.9 7-1v13c-2.6-.9-5-.6-7 1-2-1.6-4.4-1.9-7-1z" fill="none" stroke="var(--qcli-on-primary)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M16 10.5v13" stroke="var(--qcli-on-primary)" strokeWidth="1.8" />
    </svg>
  );
}

/** The scheme on screen, following every change (the toggle, the OS in `system` mode). */
function useScheme() {
  return useSyncExternalStore(
    notify => {
      const observer = new MutationObserver(notify);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-qcli-theme'] });
      return () => observer.disconnect();
    },
    currentScheme,
    () => 'dark' as const,
  );
}

function ThemeToggle() {
  const { config } = usePortal();
  const scheme = useScheme();
  const next = scheme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      onClick={() => {
        saveScheme(next);
        applyPortalTheme(config.theme, next);
      }}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-muted hover:text-text hover:bg-control transition-colors"
    >
      {scheme === 'dark' ? (
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  returnFocusTo: RefObject<HTMLElement | null>;
  title: string;
  children: ReactNode;
}

/**
 * The navigation of small screens: an off-canvas dialog, as the dashboard's. While open the page behind it does not
 * scroll and focus stays inside; Escape, the backdrop or a swipe left closes it.
 */
function Drawer({ open, onClose, returnFocusTo, title, children }: DrawerProps) {
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
        onClick={onClose}
        className={`absolute inset-0 bg-overlay motion-safe:transition-opacity motion-safe:duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        ref={panel}
        id={DRAWER_ID}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        onTouchStart={e => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={e => {
          const start = touchStart.current;
          touchStart.current = null;
          const end = e.changedTouches[0];
          if (start && end && isSwipeLeft(start, { x: end.clientX, y: end.clientY })) onClose();
        }}
        className={`absolute inset-y-0 left-0 w-[min(85vw,320px)] bg-sidebar border-r border-border shadow-xl flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center gap-2 pl-4 pr-2 h-14 border-b border-border">
          <span className="flex-1 min-w-0 font-semibold text-heading truncate">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the navigation"
            className="w-11 h-11 flex items-center justify-center rounded-lg text-lg text-muted hover:text-text hover:bg-control transition-colors"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
