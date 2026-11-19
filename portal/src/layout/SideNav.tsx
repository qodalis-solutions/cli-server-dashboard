import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { usePortal } from '../PortalContext';
import { groupPages, homePage } from '../guides/GuidesApi';

/** The site navigation: the guides by group, then the API reference. */
export default function SideNav() {
  const { config, pages } = usePortal();
  const { pathname } = useLocation();
  const home = pages?.status === 'ok' ? homePage(pages.value) : undefined;

  return (
    <nav aria-label="Documentation" className="px-3 py-6 text-sm">
      {pages?.status === 'loading' && (
        <div role="status" className="px-3 space-y-2 animate-pulse">
          <span className="sr-only">Loading the guides…</span>
          <div className="h-3 w-1/3 rounded bg-control" />
          <div className="h-4 w-3/4 rounded bg-control" />
          <div className="h-4 w-2/3 rounded bg-control" />
        </div>
      )}
      {pages?.status === 'error' && <p className="px-3 text-error">The guides could not be loaded.</p>}
      {pages?.status === 'ok' && groupPages(pages.value).map(({ group, pages: list }, i) => (
        <section key={group} className="mb-6">
          <h2 id={`qp-nav-group-${i}`} className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">
            {group}
          </h2>
          <ul aria-labelledby={`qp-nav-group-${i}`} className="space-y-0.5">
            {list.map(page => {
              const to = `/guides/${encodeURIComponent(page.slug)}`;
              const active = pathname === to || (pathname === '/' && page.slug === home?.slug);
              return (
                <li key={page.slug}>
                  <NavItem to={to} active={active}>{page.title}</NavItem>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {config.api && (
        <section className="mb-6">
          <h2 className="mb-1.5">
            <Link
              to="/reference"
              aria-current={pathname === '/reference' ? 'page' : undefined}
              className={`block px-3 text-xs font-semibold uppercase tracking-wide ${pathname === '/reference' ? 'text-primary' : 'text-subtle hover:text-text'}`}
            >
              {config.api.title}
            </Link>
          </h2>
        </section>
      )}
    </nav>
  );
}

export function NavItem({ to, active, children, extra }: { to: string; active: boolean; children: ReactNode; extra?: ReactNode }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center gap-2 min-h-9 px-3 py-1.5 rounded-md transition-colors ${
        active
          ? 'bg-primary/10 text-primary font-medium before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-primary'
          : 'text-muted hover:text-text hover:bg-control'
      }`}
    >
      <span className="flex-1 min-w-0 break-words">{children}</span>
      {extra}
    </Link>
  );
}
