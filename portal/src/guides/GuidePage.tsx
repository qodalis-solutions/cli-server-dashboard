import { useEffect, useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import Markdown from '../markdown/Markdown';
import { extractHeadings, withoutLeadingTitle } from '../markdown/headings';
import { useOptionalPortal } from '../PortalContext';
import { useAsync } from '../useAsync';
import { ErrorBox, Loading } from '../components/States';
import NotFoundPage from '../pages/NotFoundPage';
import { NotFoundError, getPage, type DocsPage, type DocsPageSummary } from './GuidesApi';
import { scrollToHash } from '../hash';

interface Props {
  /** `docs.pages` of portal.json. */
  pagesUrl: string;
  /** The page to show; by default the route's `:slug`. */
  slug?: string;
}

/** One guide: its markdown rendered safely, an "On this page" list on wide screens, previous and next guides. */
export default function GuidePage({ pagesUrl, slug: fixedSlug }: Props) {
  const params = useParams();
  const slug = fixedSlug ?? params.slug ?? '';
  const state = useAsync(`${pagesUrl}\n${slug}`, () => getPage(pagesUrl, slug));
  const { hash } = useLocation();
  const portal = useOptionalPortal();
  const siteName = portal?.config.name;

  const page = state.status === 'ok' ? state.value : null;
  useEffect(() => {
    if (!page) return;
    if (siteName) document.title = `${page.title} · ${siteName}`;
    scrollToHash(hash);
  }, [page, hash, siteName]);

  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') {
    return state.error instanceof NotFoundError
      ? <NotFoundPage what="guide" />
      : <ErrorBox title="This guide could not be loaded" error={state.error} />;
  }
  const pages = portal?.pages?.status === 'ok' ? portal.pages.value : [];
  return <GuideView page={state.value} pages={pages} />;
}

function GuideView({ page, pages }: { page: DocsPage; pages: readonly DocsPageSummary[] }) {
  const body = useMemo(() => withoutLeadingTitle(page.markdown, page.title), [page.markdown, page.title]);
  const toc = useMemo(() => extractHeadings(body), [body]);
  const index = pages.findIndex(p => p.slug === page.slug);
  const previous = index > 0 ? pages[index - 1] : undefined;
  const next = index >= 0 && index < pages.length - 1 ? pages[index + 1] : undefined;

  return (
    <div className="flex gap-12">
      <article className="min-w-0 flex-1 max-w-3xl">
        <p className="text-sm font-medium text-primary">{page.group || 'Guides'}</p>
        <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-heading break-words">{page.title}</h1>
        <Markdown markdown={body} className="mt-6" headingIds />
        {(previous || next) && (
          <nav aria-label="Previous and next guides" className="mt-14 pt-6 border-t border-border grid gap-3 sm:grid-cols-2">
            {previous ? <PagerLink page={previous} direction="previous" /> : <span />}
            {next && <PagerLink page={next} direction="next" />}
          </nav>
        )}
      </article>
      {toc.length > 1 && (
        <aside className="hidden xl:block w-56 shrink-0">
          <nav aria-label="On this page" className="sticky top-24">
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">On this page</p>
            <ul className="mt-3 space-y-2 border-l border-border text-sm">
              {toc.map(entry => (
                <li key={entry.id} className={entry.level === 3 ? 'pl-6' : 'pl-3'}>
                  <Link to={`#${entry.id}`} className="block text-muted hover:text-text -ml-px">
                    {entry.text}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      )}
    </div>
  );
}

function PagerLink({ page, direction }: { page: DocsPageSummary; direction: 'previous' | 'next' }) {
  const next = direction === 'next';
  return (
    <Link
      to={`/guides/${encodeURIComponent(page.slug)}`}
      className={`group block rounded-lg border border-border px-4 py-3 hover:border-primary/60 hover:bg-surface transition-colors ${next ? 'sm:col-start-2 text-right' : ''}`}
    >
      <span className="block text-xs text-subtle">{next ? 'Next' : 'Previous'}</span>
      <span className="block font-medium text-heading group-hover:text-primary">
        {!next && <span aria-hidden>← </span>}
        {page.title}
        {next && <span aria-hidden> →</span>}
      </span>
    </Link>
  );
}
