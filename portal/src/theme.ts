import { applyTheme, resolveTheme } from '@dashboard/theme/theme';
import type { PortalConfig } from './config';

/** The reader's own choice of scheme, kept in this browser only. */
export const THEME_STORAGE_KEY = 'qcli_portal_theme';

export type Scheme = 'dark' | 'light';

export const DEFAULT_PORTAL_THEME: PortalConfig['theme'] = { mode: 'system', dark: {}, light: {} };

/** The scheme the reader picked with the toggle, or null (follow the portal's mode). Storage may be blocked. */
export function readSavedScheme(): Scheme | null {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : null;
  } catch {
    return null;
  }
}

export function saveScheme(scheme: Scheme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, scheme);
  } catch {
    // storage unavailable (private mode, blocked): the choice lasts for this page only
  }
}

/**
 * Applies portal.json's `theme` over the dashboard's defaults (the dashboard's `resolveTheme`: unknown tokens and
 * invalid colours are dropped), in the reader's scheme when they picked one, else in the portal's mode (`system`
 * follows the OS).
 */
export function applyPortalTheme(theme: PortalConfig['theme'], scheme: Scheme | null = readSavedScheme()): void {
  const resolved = resolveTheme(theme);
  let mode = scheme ?? resolved.mode;
  // Without matchMedia (old browsers, tests) the OS preference cannot be read
  if (mode === 'system' && typeof window.matchMedia !== 'function') mode = 'light';
  applyTheme({ ...resolved, mode });
}

/** The scheme on screen now. */
export function currentScheme(): Scheme {
  return document.documentElement.dataset.qcliTheme === 'light' ? 'light' : 'dark';
}
