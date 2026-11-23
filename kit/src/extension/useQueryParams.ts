import { useMemo } from 'react';
import { useDashboard } from './defineExtension';

/**
 * The query of the page's own path (`/?event=login&range=24h`) and a setter that replaces it, like react-router's
 * `useSearchParams` but on the dashboard's context: the URL keeps the filters, so a link or a reload shows the same list.
 */
export function useQueryParams(): [URLSearchParams, (update: (prev: URLSearchParams) => URLSearchParams) => void] {
  const { path, navigate } = useDashboard();
  const query = path.includes('?') ? path.slice(path.indexOf('?') + 1).split('#')[0] : '';
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const pathname = path.split(/[?#]/)[0] || '/';
  const set = (update: (prev: URLSearchParams) => URLSearchParams) => {
    const next = update(new URLSearchParams(query)).toString();
    navigate(next ? `${pathname}?${next}` : pathname, { replace: true });
  };
  return [params, set];
}
