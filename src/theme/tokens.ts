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

/**
 * Dark look, matching the Qodalis CLI panel (`cli-panel.css`): gray-900 background,
 * gray-800 header, gray-700 borders, indigo-400 accent with the violet glow, and the
 * panel's status colors.
 */
export const DARK_COLORS: ThemeColors = {
  primary: '#818cf8',
  primaryHover: '#a5b4fc',
  onPrimary: '#111827',
  accent: '#a78bfa',
  background: '#111827',
  backgroundAccent: '#1f2937',
  sidebar: '#1f2937',
  surface: 'rgba(255, 255, 255, 0.04)',
  popover: '#1f2937',
  control: 'rgba(255, 255, 255, 0.06)',
  controlHover: 'rgba(255, 255, 255, 0.1)',
  border: '#374151',
  overlay: 'rgba(0, 0, 0, 0.6)',
  heading: '#ffffff',
  text: 'rgba(255, 255, 255, 0.87)',
  muted: 'rgba(255, 255, 255, 0.6)',
  subtle: 'rgba(255, 255, 255, 0.4)',
  success: '#3fb950',
  warning: '#f0883e',
  error: '#f85149',
  info: '#58a6ff',
};

/**
 * Light counterpart of the panel colors (the panel itself is dark only): the same
 * grays inverted, indigo-600 / violet-600 accents, and status colors dark enough
 * to read on white. Used when the mode is `light` (or `system` on a light OS).
 */
export const LIGHT_COLORS: ThemeColors = {
  primary: '#4f46e5',
  primaryHover: '#4338ca',
  onPrimary: '#ffffff',
  accent: '#7c3aed',
  background: '#f9fafb',
  backgroundAccent: '#eef2ff',
  sidebar: '#ffffff',
  surface: '#ffffff',
  popover: '#ffffff',
  control: 'rgba(17, 24, 39, 0.05)',
  controlHover: 'rgba(17, 24, 39, 0.1)',
  border: '#e5e7eb',
  overlay: 'rgba(17, 24, 39, 0.45)',
  heading: '#111827',
  text: '#1f2937',
  muted: '#4b5563',
  subtle: '#6b7280',
  success: '#1a7f37',
  warning: '#bc4c00',
  error: '#cf222e',
  info: '#0969da',
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
