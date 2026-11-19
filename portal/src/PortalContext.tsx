import { createContext, useContext, type ReactNode } from 'react';
import type { PortalConfig } from './config';
import { listPages, type DocsPageSummary } from './guides/GuidesApi';
import { groupByTag, loadDocument, serverUrlOf, type OpenApiDocument, type TagGroup } from './reference/openapi';
import { useAsync, type AsyncState } from './useAsync';

/** The public OpenAPI document, its operations by tag and the base URL requests go to. */
export interface Reference {
  doc: OpenApiDocument;
  tags: TagGroup[];
  serverUrl: string;
}

interface PortalData {
  config: PortalConfig;
  /** The guides' list (null when the docs section is off). */
  pages: AsyncState<DocsPageSummary[]> | null;
  /** The API reference (null when the api section is off). */
  reference: AsyncState<Reference> | null;
}

const PortalContext = createContext<PortalData | null>(null);

async function loadReference(url: string): Promise<Reference> {
  const doc = await loadDocument(url);
  return { doc, tags: groupByTag(doc), serverUrl: serverUrlOf(doc, new URL(url, document.baseURI).href) };
}

/** Loads what every page shares (the guides' list, the OpenAPI document) once, below portal.json. */
export function PortalProvider({ config, children }: { config: PortalConfig; children: ReactNode }) {
  const pagesUrl = config.docs?.pages ?? null;
  const openapiUrl = config.api?.openapi ?? null;
  const pages = useAsync(pagesUrl, () => listPages(pagesUrl!));
  const reference = useAsync(openapiUrl, () => loadReference(openapiUrl!));
  return (
    <PortalContext.Provider value={{ config, pages: config.docs ? pages : null, reference: config.api ? reference : null }}>
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
