import { isSafeSignInUrl } from './api/signIn';

/**
 * How the dashboard names itself: the `branding` of `theme.json` (admin plugin `Branding` option).
 * Unset values keep the Qodalis defaults (the `nav.appName` text, the Qodalis Solutions logo).
 */
export interface DashboardBranding {
  name?: string;
  icon?: string;
  /** The terminal's branding (`CliOptions.branding`): its name in the welcome banner. */
  cli?: { name: string };
}

/** The Qodalis Solutions logo, shipped with the dashboard. */
export const DEFAULT_ICON = `${import.meta.env.BASE_URL}qodalis-icon.svg`;

const MAX_NAME = 80;
const MAX_ICON = 200_000;
const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/]+={0,2}$/;

function text(value: unknown, max = MAX_NAME): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  // eslint-disable-next-line no-control-regex -- names are one line of plain text
  return trimmed.length > 0 && trimmed.length <= max && !/[\u0000-\u001f\u007f]/.test(trimmed) ? trimmed : undefined;
}

/** An http(s) URL, a root-relative path or a base64 `data:image` URL; anything else is dropped. */
export function isSafeIconUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ICON) return false;
  return isSafeSignInUrl(value) || DATA_IMAGE.test(value);
}

/** Reads the `branding` of a `theme.json` document; invalid values are dropped, never thrown. */
export function resolveBranding(input: unknown): DashboardBranding {
  const doc = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const raw = doc.branding && typeof doc.branding === 'object' ? (doc.branding as Record<string, unknown>) : {};
  const branding: DashboardBranding = {};

  const name = text(raw.name);
  if (name) branding.name = name;
  if (isSafeIconUrl(raw.icon)) branding.icon = raw.icon;

  const cliName = raw.cli && typeof raw.cli === 'object' ? text((raw.cli as Record<string, unknown>).name) : undefined;
  if (cliName) branding.cli = { name: cliName };
  return branding;
}

let current: DashboardBranding = {};

/** The branding the dashboard was started with (see {@link applyBranding}). */
export function getBranding(): DashboardBranding {
  return current;
}

/** Keeps the branding for the pages and sets the browser tab's title and icon. */
export function applyBranding(branding: DashboardBranding, doc: Document = document): void {
  current = branding;
  if (branding.name) doc.title = branding.name;
  const link = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) {
    link.href = branding.icon ?? DEFAULT_ICON;
    link.removeAttribute('type');
  }
}
