import { useMemo } from 'react';
import { useDashboard } from '@qodalis/cli-server-dashboard-kit';

/**
 * The page's routing on the extension's own path (`useDashboard().path`, below `/x/jobs`): `/` the jobs, `/<id>` a
 * job; query parameters (`?q=`, `?at=`, `?run=`) as the dashboard's URL carries them.
 */

function split(path: string): { pathname: string; search: string } {
  const hash = path.indexOf('#');
  const withoutHash = hash === -1 ? path : path.slice(0, hash);
  const q = withoutHash.indexOf('?');
  return q === -1 ? { pathname: withoutHash || '/', search: '' } : { pathname: withoutHash.slice(0, q) || '/', search: withoutHash.slice(q) };
}

/** The job id of `/<id>` (decoded), or null on the list. */
export function jobIdOf(path: string): string | null {
  const segment = split(path).pathname.replace(/^\/+/, '').split('/')[0];
  return segment ? decodeURIComponent(segment) : null;
}

export function useNavigate() {
  const { navigate } = useDashboard();
  return (to: string, options?: { replace?: boolean }) => navigate(to, options);
}

/** The job id of the current path, as react-router's `useParams` gave it. */
export function useParams(): { id?: string } {
  const { path } = useDashboard();
  const id = jobIdOf(path);
  return id ? { id } : {};
}

type SetParams = (next: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams), options?: { replace?: boolean }) => void;

export function useSearchParams(): [URLSearchParams, SetParams] {
  const { path, navigate } = useDashboard();
  const { pathname, search } = split(path);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const set: SetParams = (next, options) => {
    const value = typeof next === 'function' ? next(new URLSearchParams(search)) : next;
    const query = value.toString();
    navigate(`${pathname}${query ? `?${query}` : ''}`, options);
  };
  return [params, set];
}
