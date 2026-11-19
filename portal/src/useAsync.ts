import { useEffect, useState } from 'react';

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ok'; value: T }
  | { status: 'error'; error: Error };

const LOADING = { status: 'loading' } as const;

/**
 * Runs `load` whenever `key` changes and returns its state. A null key loads nothing (stays `loading`). Answers of
 * an older key are dropped, so a slow first request never overwrites a newer one.
 */
export function useAsync<T>(key: string | null, load: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<{ key: string | null; result: AsyncState<T> }>({ key: null, result: LOADING });

  useEffect(() => {
    if (key === null) return;
    let current = true;
    load().then(
      value => { if (current) setState({ key, result: { status: 'ok', value } }); },
      (error: unknown) => {
        if (current) setState({ key, result: { status: 'error', error: error instanceof Error ? error : new Error(String(error)) } });
      },
    );
    return () => { current = false; };
    // `load` is a fresh closure on every render; the key says when to load again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return key !== null && state.key === key ? state.result : LOADING;
}
