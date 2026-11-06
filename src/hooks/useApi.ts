import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Fetches again without showing the loading state: the current data stays until the new data replaces it. */
  refresh: () => void;
}

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the latest request may update state (deps change / refetch while one is in flight)
  const requestRef = useRef(0);

  const fetch = useCallback(async (quiet?: boolean) => {
    const request = ++requestRef.current;
    if (quiet !== true) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await fetcher();
      if (request === requestRef.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (request === requestRef.current) setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  // The caller's deps decide when to refetch
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, deps);

  useEffect(() => { fetch(); }, [fetch]);

  const refetch = useCallback(() => { void fetch(); }, [fetch]);
  const refresh = useCallback(() => { void fetch(true); }, [fetch]);
  return { data, loading, error, refetch, refresh };
}
