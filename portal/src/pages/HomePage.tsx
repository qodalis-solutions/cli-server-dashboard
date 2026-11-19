import { Navigate } from 'react-router';
import { usePortal } from '../PortalContext';
import GuidePage from '../guides/GuidePage';
import { homePage } from '../guides/GuidesApi';
import { ErrorBox, Loading } from '../components/States';

/**
 * The start page: the guides' `index` page (else the first guide); the API reference when only the API is
 * published; "Nothing published yet" when neither section is on.
 */
export default function HomePage() {
  const { config, pages } = usePortal();

  if (pages) {
    if (pages.status === 'loading') return <Loading />;
    if (pages.status === 'error') return <ErrorBox title="The guides could not be loaded" error={pages.error} />;
    const home = homePage(pages.value);
    if (home) return <GuidePage pagesUrl={config.docs!.pages} slug={home.slug} />;
  }
  if (config.api) return <Navigate to="/reference" replace />;
  return <NothingPublished name={config.name} />;
}

function NothingPublished({ name }: { name: string }) {
  return (
    <div className="py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-heading">{name}</h1>
      <p className="mt-4 text-lg text-heading">Nothing published yet</p>
      <p className="mt-2 text-muted">Guides and the API reference appear here once they are published.</p>
    </div>
  );
}
