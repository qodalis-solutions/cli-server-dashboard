/**
 * Color tokens of the dashboard. Every color in the UI comes from one of these,
 * as the CSS custom property `--qcli-<kebab-name>` (e.g. `--qcli-primary-hover`).
 * Tailwind exposes each one as a color (`bg-primary`, `text-muted`,
 * `border-border/50`, ...), see tailwind.config.ts.
 *
 * Integrators override them through the admin plugin's `theme` option, which the
 * server publishes at `<dashboard>/theme.json` (see README, "Color scheme").
 */
export const THEME_TOKENS = [
  'primary',
  'primaryHover',
  'onPrimary',
  'accent',
  'background',
  'backgroundAccent',
  'sidebar',
  'surface',
  'popover',
  'control',
  'controlHover',
  'border',
  'overlay',
  'heading',
  'text',
  'muted',
  'subtle',
  'success',
  'warning',
  'error',
  'info',
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];
export type ThemeColors = Record<ThemeToken, string>;
export type ThemeMode = 'dark' | 'light' | 'system';

export interface DashboardTheme {
  mode: ThemeMode;
  dark: ThemeColors;
  light: ThemeColors;
}

/** The dashboard's original dark look. */
export const DARK_COLORS: ThemeColors = {
  primary: '#6366f1',
  primaryHover: '#4f46e5',
  onPrimary: '#ffffff',
  accent: '#a5b4fc',
  background: '#0f172a',
  backgroundAccent: '#1e1b4b',
  sidebar: 'rgba(0, 0, 0, 0.3)',
  surface: 'rgba(255, 255, 255, 0.04)',
  popover: '#1e1b4b',
  control: 'rgba(255, 255, 255, 0.06)',
  controlHover: 'rgba(255, 255, 255, 0.1)',
  border: 'rgba(255, 255, 255, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.6)',
  heading: '#ffffff',
  text: '#e2e8f0',
  muted: '#94a3b8',
  subtle: '#64748b',
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#f87171',
  info: '#22d3ee',
};

/** Light counterpart, used when the mode is `light` (or `system` on a light OS). */
export const LIGHT_COLORS: ThemeColors = {
  primary: '#4f46e5',
  primaryHover: '#4338ca',
  onPrimary: '#ffffff',
  accent: '#4338ca',
  background: '#f8fafc',
  backgroundAccent: '#eef2ff',
  sidebar: '#ffffff',
  surface: '#ffffff',
  popover: '#ffffff',
  control: 'rgba(15, 23, 42, 0.05)',
  controlHover: 'rgba(15, 23, 42, 0.1)',
  border: 'rgba(15, 23, 42, 0.12)',
  overlay: 'rgba(15, 23, 42, 0.45)',
  heading: '#0f172a',
  text: '#1e293b',
  muted: '#475569',
  subtle: '#64748b',
  success: '#15803d',
  warning: '#b45309',
  error: '#dc2626',
  info: '#0e7490',
};

export const DEFAULT_THEME: DashboardTheme = {
  mode: 'dark',
  dark: DARK_COLORS,
  light: LIGHT_COLORS,
};

/** `primaryHover` -> `--qcli-primary-hover` */
export function cssVarName(token: ThemeToken): string {
  return `--qcli-${token.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;
}
