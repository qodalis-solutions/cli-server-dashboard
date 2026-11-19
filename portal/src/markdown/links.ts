/**
 * Where a markdown link points inside the portal, as a router path, or null when it leaves the portal (a URL with a
 * scheme, `//host`, or a root-relative server path such as `/qcli/api/swagger`).
 *
 * - `auth`, `./auth`, `auth.md`, `./auth.md#section` → `/guides/auth(#section)`
 * - `../reference/Rates`, `reference` → `/reference/Rates`, `/reference`
 * - `#section` → the same page's anchor
 */
export function internalPath(href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('/') || href.startsWith('\\')) return null;
  if (href.startsWith('#')) return href;
  const hashAt = href.indexOf('#');
  const hash = hashAt >= 0 ? href.slice(hashAt) : '';
  const path = (hashAt >= 0 ? href.slice(0, hashAt) : href).split('?')[0];
  const segments = path.split('/').filter(s => s && s !== '.' && s !== '..');
  if (segments.length === 0) return hash || null;
  segments[segments.length - 1] = segments[segments.length - 1].replace(/\.md$/i, '');
  if (segments[0] === 'guides' || segments[0] === 'reference') return `/${segments.join('/')}${hash}`;
  return `/guides/${segments.join('/')}${hash}`;
}
