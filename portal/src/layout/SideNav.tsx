import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { usePortal } from '../PortalContext';
import { groupPages, homePage } from '../guides/GuidesApi';
import MethodBadge from '../reference/MethodBadge';
import { operationId } from '../reference/openapi';

/** The site navigation: the guides by group, then the API reference by tag (the open tag's operations below it). */
export default function SideNav() {
  const { config, pages, reference } = usePortal();
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
          {reference?.status === 'loading' && (
            <div role="status" className="px-3 space-y-2 animate-pulse">
              <span className="sr-only">Loading the API reference…</span>
              <div className="h-4 w-1/2 rounded bg-control" />
              <div className="h-4 w-2/3 rounded bg-control" />
            </div>
          )}
          {reference?.status === 'error' && <p className="px-3 text-error">The API could not be loaded.</p>}
          {reference?.status === 'ok' && (
            <ul aria-label={config.api.title} className="space-y-0.5">
              {reference.value.tags.map(group => {
                const to = `/reference/${encodeURIComponent(group.tag)}`;
                const active = pathname === to;
                return (
                  <li key={group.tag}>
                    <NavItem to={to} active={active}>{group.tag}</NavItem>
                    {active && (
                      <ul aria-label={`Operations of ${group.tag}`} className="mt-0.5 mb-2 ml-3 border-l border-border pl-2 space-y-0.5">
                        {group.operations.map(op => (
                          <li key={`${op.method} ${op.path}`}>
                            <Link
                              to={`${to}#${operationId(op)}`}
                              className="flex items-start gap-2 px-2 py-1 rounded-md text-[13px] text-muted hover:text-text hover:bg-control"
                            >
                              <MethodBadge method={op.method} small />
                              <span className="min-w-0 break-words">{op.summary ?? op.path}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
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
