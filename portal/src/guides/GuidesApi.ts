/** A docs page as listed by `<docs base>/pages` (contract C7), in page order. */
export interface DocsPageSummary {
  slug: string;
  title: string;
  group: string;
  order: number;
}

/** One page, `<docs base>/pages/<slug>`, its markdown with the variables already replaced by the server. */
export interface DocsPage extends DocsPageSummary {
  markdown: string;
}

/** The server answered 404 (unknown page or document). */
export class NotFoundError extends Error {
  constructor(url: string) {
    super(`${url}: 404`);
    this.name = 'NotFoundError';
  }
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache', headers: { Accept: 'application/json' } });
  if (res.status === 404) throw new NotFoundError(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

export async function listPages(url: string): Promise<DocsPageSummary[]> {
  const pages = await getJson<unknown>(url);
  return Array.isArray(pages) ? (pages as DocsPageSummary[]).filter(p => p && typeof p.slug === 'string') : [];
}

export async function getPage(url: string, slug: string): Promise<DocsPage> {
  const page = await getJson<DocsPage>(`${url.replace(/\/+$/, '')}/${encodeURIComponent(slug)}`);
  return { ...page, markdown: typeof page.markdown === 'string' ? page.markdown : '' };
}

/** The guides in navigation order, grouped by `group` in the order each group first appears. */
export function groupPages(pages: readonly DocsPageSummary[]): { group: string; pages: DocsPageSummary[] }[] {
  const groups = new Map<string, DocsPageSummary[]>();
  for (const page of pages) {
    const group = page.group || 'Guides';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(page);
  }
  return [...groups].map(([group, list]) => ({ group, pages: list }));
}

/** The guides' home page: `index` when it exists, else the first page. */
export function homePage(pages: readonly DocsPageSummary[]): DocsPageSummary | undefined {
  return pages.find(p => p.slug === 'index') ?? pages[0];
}
