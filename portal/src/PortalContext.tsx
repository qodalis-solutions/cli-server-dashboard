import { createContext, useContext, type ReactNode } from 'react';
import type { PortalConfig } from './config';
import { listPages, type DocsPageSummary } from './guides/GuidesApi';
import { useAsync, type AsyncState } from './useAsync';

interface PortalData {
  config: PortalConfig;
  /** The guides' list (null when the docs section is off). */
  pages: AsyncState<DocsPageSummary[]> | null;
}

const PortalContext = createContext<PortalData | null>(null);

/** Loads what every page shares (the guides' list) once, below portal.json. */
export function PortalProvider({ config, children }: { config: PortalConfig; children: ReactNode }) {
  const pagesUrl = config.docs?.pages ?? null;
  const pages = useAsync(pagesUrl, () => listPages(pagesUrl!));
  return (
    <PortalContext.Provider value={{ config, pages: config.docs ? pages : null }}>
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal(): PortalData {
  const data = useContext(PortalContext);
  if (!data) throw new Error('usePortal() needs a <PortalProvider>');
  return data;
}

/** The portal's data, or null outside the provider (a page rendered on its own, as in tests). */
export function useOptionalPortal(): PortalData | null {
  return useContext(PortalContext);
}
