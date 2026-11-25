import { useSyncExternalStore } from 'react';
import { DEFAULT_THEME, type DashboardTheme, type ThemeMode } from './tokens';
import { applyTheme } from './theme';

/**
 * The viewer's own color scheme, kept in this browser: `system` (Device: follows the OS), `light` or `dark`. It
 * overrides the server's `mode`; the server's colors for each scheme still apply.
 */
export type ThemeChoice = ThemeMode;

export const THEME_CHOICE_KEY = 'qcli_admin_theme';
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

const isChoice = (value: unknown): value is ThemeChoice => THEME_CHOICES.includes(value as ThemeChoice);

/** Set when storage refused a choice, so it still holds for this page; `undefined`: read storage. */
let unsaved: ThemeChoice | null | undefined;
/** The server's theme (theme.json), kept so a choice re-applies its colors. */
let serverTheme: DashboardTheme = DEFAULT_THEME;
const listeners = new Set<() => void>();

/** The choice saved in this browser, or null (use the server's mode). Storage may be blocked. */
export function readThemeChoice(): ThemeChoice | null {
  if (unsaved !== undefined) return unsaved;
  try {
    const saved = localStorage.getItem(THEME_CHOICE_KEY);
    return isChoice(saved) ? saved : null;
  } catch {
    return null;
  }
}

function saveThemeChoice(choice: ThemeChoice | null): void {
  try {
    if (choice) localStorage.setItem(THEME_CHOICE_KEY, choice);
    else localStorage.removeItem(THEME_CHOICE_KEY);
    unsaved = undefined;
  } catch {
    // Storage unavailable (private mode, blocked): the choice lasts for this page only
    unsaved = choice;
  }
}

/** The scheme selection in effect: the viewer's choice, else the server's mode. */
export function resolveThemeMode(server: ThemeMode, choice: ThemeChoice | null): ThemeMode {
  return choice ?? server;
}

/**
 * Applies the server's theme in the viewer's scheme (their saved choice over the server's `mode`). Called with the
 * defaults first thing in main.tsx, before theme.json answers and before React renders, so a saved choice shows
 * from the first paint; then with the server's theme.
 */
export function applyDashboardTheme(theme: DashboardTheme, choice: ThemeChoice | null = readThemeChoice()): void {
  serverTheme = theme;
  let mode = resolveThemeMode(theme.mode, choice);
  // Without matchMedia (old browsers, tests) the OS preference cannot be read: the dark default
  if (mode === 'system' && typeof window.matchMedia !== 'function') mode = 'dark';
  applyTheme({ ...theme, mode });
  listeners.forEach(notify => notify());
}

/** The choice the theme control shows: the viewer's, or the server's mode when they made none. */
export function currentThemeChoice(): ThemeChoice {
  return resolveThemeMode(serverTheme.mode, readThemeChoice());
}

/** Saves the viewer's choice and switches to it live (no reload). */
export function setThemeChoice(choice: ThemeChoice): void {
  saveThemeChoice(choice);
  applyDashboardTheme(serverTheme, choice);
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** The theme control's value and setter, following changes made anywhere (sidebar, drawer, palette). */
export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribe, currentThemeChoice, currentThemeChoice);
  return [choice, setThemeChoice];
}

/** Tests: forget the server's theme and any unsaved choice. */
export function resetThemeChoiceForTests(): void {
  unsaved = undefined;
  serverTheme = DEFAULT_THEME;
}
