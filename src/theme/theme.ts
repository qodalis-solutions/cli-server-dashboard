import {
  DEFAULT_THEME,
  THEME_TOKENS,
  cssVarName,
  type DashboardTheme,
  type ThemeColors,
  type ThemeMode,
  type ThemeToken,
} from './tokens';

/**
 * Accepted color syntax, the same rule the servers apply: a hex color, a color
 * function with plain numeric arguments, or a named color. No `;`, `{`, `}`,
 * quotes or nested functions can get through, so a value cannot escape its
 * declaration.
 */
const COLOR_PATTERNS = [
  /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
  /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([0-9a-z.,%+\-\s/]*\)$/i,
  /^[a-z]{3,30}$/i,
];
const MAX_COLOR_LENGTH = 100;

export function isColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v || v.length > MAX_COLOR_LENGTH || !COLOR_PATTERNS.some(p => p.test(v))) return false;
  // In a browser, also let the engine confirm it parses as a color
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', v);
  }
  return true;
}

const MODES: readonly ThemeMode[] = ['dark', 'light', 'system'];
const TOKEN_SET = new Set<string>(THEME_TOKENS);

function mergeColors(base: ThemeColors, overrides: unknown, scheme: string): ThemeColors {
  const result = { ...base };
  if (overrides == null) return result;
  if (typeof overrides !== 'object' || Array.isArray(overrides)) {
    console.warn(`[theme] ignoring "${scheme}": expected an object of colors`);
    return result;
  }
  for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
    if (!TOKEN_SET.has(key)) {
      console.warn(`[theme] ignoring unknown token "${scheme}.${key}"`);
    } else if (!isColor(value)) {
      console.warn(`[theme] ignoring invalid color for "${scheme}.${key}"`);
    } else {
      result[key as ThemeToken] = value.trim();
    }
  }
  return result;
}

/**
 * Merges a theme document (`theme.json`) over the defaults. Anything that is
 * not a known token with a valid color is dropped, so a bad value never breaks
 * the page.
 */
export function resolveTheme(input: unknown): DashboardTheme {
  const doc = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
  const mode = MODES.includes(doc.mode as ThemeMode) ? (doc.mode as ThemeMode) : DEFAULT_THEME.mode;
  return {
    mode,
    dark: mergeColors(DEFAULT_THEME.dark, doc.dark, 'dark'),
    light: mergeColors(DEFAULT_THEME.light, doc.light, 'light'),
  };
}

function declarations(colors: ThemeColors, scheme: 'dark' | 'light'): string {
  const vars = THEME_TOKENS.map(token => `  ${cssVarName(token)}: ${colors[token]};`);
  return [...vars, `  color-scheme: ${scheme};`].join('\n');
}

/** Stylesheet defining every token for both schemes, keyed on `data-qcli-theme`. */
export function buildThemeCss(theme: DashboardTheme): string {
  return [
    `:root, :root[data-qcli-theme="dark"] {\n${declarations(theme.dark, 'dark')}\n}`,
    `:root[data-qcli-theme="light"] {\n${declarations(theme.light, 'light')}\n}`,
  ].join('\n');
}

const STYLE_ID = 'qcli-theme';
let stopFollowingSystem: (() => void) | undefined;

/** Writes the theme's variables into the document and selects its scheme. */
export function applyTheme(theme: DashboardTheme, doc: Document = document): void {
  let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent = buildThemeCss(theme);

  stopFollowingSystem?.();
  stopFollowingSystem = undefined;
  const root = doc.documentElement;
  if (theme.mode !== 'system') {
    root.dataset.qcliTheme = theme.mode;
    return;
  }
  const query = window.matchMedia('(prefers-color-scheme: light)');
  const update = () => { root.dataset.qcliTheme = query.matches ? 'light' : 'dark'; };
  update();
  query.addEventListener('change', update);
  stopFollowingSystem = () => query.removeEventListener('change', update);
}

/**
 * Fetches the server's `theme.json` (color scheme and branding). A missing file,
 * an error or a slow answer (`timeoutMs`) gives null: the defaults.
 */
export async function fetchThemeDocument(url: string, timeoutMs = 2000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The server's color scheme (`<base>/theme.json`), or the defaults. */
export async function loadTheme(url: string, timeoutMs = 2000): Promise<DashboardTheme> {
  return resolveTheme(await fetchThemeDocument(url, timeoutMs));
}
