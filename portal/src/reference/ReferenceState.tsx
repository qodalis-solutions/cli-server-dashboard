import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface ReferenceState {
  /**
   * The token pasted into "try it". Held in this provider's memory only, above the routes: it survives moving
   * between operations and tags, and is gone on reload. Never written to storage, a cookie or the URL.
   */
  token: string;
  setToken: (token: string) => void;
  /** The code-sample language chosen on any operation, shown on every one. */
  lang: string;
  setLang: (lang: string) => void;
}

const Context = createContext<ReferenceState | null>(null);

export function ReferenceStateProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState('');
  const [lang, setLang] = useState('curl');
  const value = useMemo(() => ({ token, setToken, lang, setLang }), [token, lang]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useReferenceState(): ReferenceState {
  const state = useContext(Context);
  if (!state) throw new Error('useReferenceState() needs a <ReferenceStateProvider>');
  return state;
}
