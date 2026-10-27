import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the latest request may update state (deps change / refetch while one is in flight)
  const requestRef = useRef(0);

  const fetch = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (request === requestRef.current) setData(result);
    } catch (e) {
      if (request === requestRef.current) setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  // The caller's deps decide when to refetch
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, deps);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
