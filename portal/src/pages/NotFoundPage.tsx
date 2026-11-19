import { useEffect } from 'react';
import { Link } from 'react-router';
import { useOptionalPortal } from '../PortalContext';

export default function NotFoundPage({ what = 'page' }: { what?: string }) {
  const name = useOptionalPortal()?.config.name;
  useEffect(() => {
    if (name) document.title = `Not found · ${name}`;
  }, [name]);
  return (
    <div className="py-16 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-heading">Not found</h1>
      <p className="mt-3 text-muted">This {what} does not exist, or it has moved.</p>
      <Link to="/" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <span aria-hidden>←</span> Back to the start
      </Link>
    </div>
  );
}
