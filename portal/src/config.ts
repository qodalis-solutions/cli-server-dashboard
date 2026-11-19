import type { ThemeMode } from '@dashboard/theme/tokens';

/**
 * `portal.json`, served by the server's portal plugin next to the site (contract C8): the host's name, logo, colours
 * and footer links, and which sections exist (`docs` from the docs plugin, `api` from the public-api plugin; null
 * when that plugin is not given to the portal).
 */
export interface PortalConfig {
  name: string;
  logo: string | null;
  theme: { mode: ThemeMode; dark: Record<string, string>; light: Record<string, string> };
  footerLinks: { label: string; url: string }[];
  docs: { title: string; pages: string } | null;
  api: { title: string; openapi: string; swagger: string } | null;
}

/**
 * The path the site is mounted at, from the `<base href>` the server writes into index.html: `/developers` for a
 * site at `/developers/`, `/` for a root mount. It is the router's basename.
 */
export function basePath(): string {
  const path = new URL(document.baseURI).pathname;
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : '/';
}

/** A file of the site (`portal.json`, an asset) as a path below the mount. */
export function siteUrl(file: string): string {
  return new URL(file, document.baseURI).pathname;
}

/** An http(s) URL or a root-relative path; anything else (`javascript:`, `//host`, ...) is refused. */
export function isSafeLink(url: unknown): url is string {
  if (typeof url !== 'string' || !url) return false;
  if (url.startsWith('/')) return !url.startsWith('//') && !url.startsWith('/\\');
  return /^https?:\/\/[^\s]+$/i.test(url);
}

function isSafeLogo(url: unknown): url is string {
  return isSafeLink(url) || (typeof url === 'string' && /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(url));
}

const MODES: readonly ThemeMode[] = ['dark', 'light', 'system'];

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function colors(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

const text = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value : fallback);

/**
 * Reads a portal.json body defensively: the server validates it, but a missing or odd field never breaks the
 * page (it falls back to the defaults), and links with an unsafe scheme are dropped.
 */
export function normalizeConfig(input: unknown): PortalConfig {
  const doc = isObject(input) ? input : {};
  const theme = isObject(doc.theme) ? doc.theme : {};
  const docs = isObject(doc.docs) && typeof doc.docs.pages === 'string'
    ? { title: text(doc.docs.title, 'Guides'), pages: doc.docs.pages }
    : null;
  const api = isObject(doc.api) && typeof doc.api.openapi === 'string'
    ? {
        title: text(doc.api.title, 'API reference'),
        openapi: doc.api.openapi,
        swagger: typeof doc.api.swagger === 'string' ? doc.api.swagger : '',
      }
    : null;
  return {
    name: text(doc.name, 'Documentation'),
    logo: isSafeLogo(doc.logo) ? doc.logo : null,
    theme: {
      mode: MODES.includes(theme.mode as ThemeMode) ? (theme.mode as ThemeMode) : 'system',
      dark: colors(theme.dark),
      light: colors(theme.light),
    },
    footerLinks: (Array.isArray(doc.footerLinks) ? doc.footerLinks : [])
      .filter(isObject)
      .filter(link => typeof link.label === 'string' && link.label.trim() !== '' && isSafeLink(link.url))
      .map(link => ({ label: link.label as string, url: link.url as string })),
    docs,
    api,
  };
}

/** Fetches `portal.json` below the mount. Rejects with `portal.json: <status>` when the server refuses it. */
export async function loadPortalConfig(): Promise<PortalConfig> {
  const res = await fetch(siteUrl('portal.json'), { cache: 'no-cache', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`portal.json: ${res.status}`);
  return normalizeConfig(await res.json());
}
