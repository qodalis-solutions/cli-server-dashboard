/** Heading anchors: ids for the rendered headings and the "On this page" list, from the same slugger. */

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** Ids the page itself uses: a heading never takes them. */
const RESERVED_IDS = new Set(['root', 'qcli-theme', 'main', 'content']);

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'section';
}

/** Gives each heading text a unique id, in document order (`setup`, `setup-1`, ...), as GitHub does. */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return text => {
    let base = slugify(text);
    if (RESERVED_IDS.has(base)) base = `${base}-section`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
}

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

const HEADING = /^h[1-6]$/;

/** Rehype plugin: an `id` on every heading, so `#anchors` and the "On this page" list reach them. */
export function rehypeHeadingIds() {
  return (tree: HastNode) => {
    const slug = createSlugger();
    const visit = (node: HastNode) => {
      if (node.type === 'element' && node.tagName && HEADING.test(node.tagName)) {
        node.properties = { ...node.properties, id: slug(textOf(node)) };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

export interface TocEntry {
  id: string;
  text: string;
  level: number;
}

/** Inline markdown of a heading line as plain text: links, emphasis and code marks removed. */
function plainHeading(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, '$2')
    .trim();
}

/** The `##` and `###` headings of a page, with the ids the renderer gives them (fenced code is skipped). */
export function extractHeadings(markdown: string): TocEntry[] {
  const slug = createSlugger();
  const entries: TocEntry[] = [];
  let fence: string | null = null;
  for (const line of markdown.split('\n')) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (fence === null) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
    if (!heading) continue;
    const text = plainHeading(heading[2]);
    const id = slug(text);
    const level = heading[1].length;
    if (level === 2 || level === 3) entries.push({ id, text, level });
  }
  return entries;
}

/**
 * The page's title is shown above the body, so a first `# Heading` line (the title's source when the page has no
 * front matter title) is not repeated.
 */
export function withoutLeadingTitle(markdown: string): string {
  return markdown.replace(/^\s*#\s+[^\n]*\n?/, '');
}
