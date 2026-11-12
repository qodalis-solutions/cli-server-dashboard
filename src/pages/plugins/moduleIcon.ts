/** How a module's icon is shown: an image, a text glyph (emoji), or the module's initial in a tinted circle. */
export type ModuleIcon =
  | { kind: 'image'; src: string }
  | { kind: 'text'; text: string }
  | { kind: 'letter'; letter: string; tint: number };

/** An absolute http(s) URL or a root-relative path (not `//host`): never `javascript:` or `data:`. */
export function isIconUrl(value: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(value) || /^\/(?![/\\])[^\s]*$/.test(value);
}

/** Number of tints the letter avatar picks from (see `TINTS` in ModuleIconView). */
export const TINT_COUNT = 5;

/** The letter of a module: the first letter or digit of its name, without an npm scope (`@qodalis/`). */
export function moduleInitial(name: string): string {
  const bare = name.trim().replace(/^@[^/]+\//, '');
  const match = bare.match(/[\p{L}\p{N}]/u);
  return match ? match[0].toLocaleUpperCase() : '?';
}

/** A stable tint for a name, so a module keeps its color between visits. */
export function tintOf(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return hash % TINT_COUNT;
}

/**
 * The icon to show for a module: the server's `icon` (a URL as an image, anything else as text, e.g. an emoji),
 * else `fallback` (e.g. a command's icon), else the module's initial.
 */
export function resolveModuleIcon(icon: string | null | undefined, name: string, fallback?: string | null): ModuleIcon {
  for (const candidate of [icon, fallback]) {
    const value = typeof candidate === 'string' ? candidate.trim() : '';
    if (!value) continue;
    if (isIconUrl(value)) return { kind: 'image', src: value };
    // Text icons are a glyph or two, not a sentence; something longer (or another scheme) is not shown
    if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && [...value].length <= 8) return { kind: 'text', text: value };
  }
  return { kind: 'letter', letter: moduleInitial(name), tint: tintOf(name) };
}
