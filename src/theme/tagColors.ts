import type { CSSProperties } from 'react';

/** One hue of the tag palette, for each scheme: chip text, tinted background, border, and the filled (selected) look. */
interface TagHue {
  name: string;
  dark: TagShades;
  light: TagShades;
}

interface TagShades {
  fg: string;
  bg: string;
  border: string;
  /** Background of a selected chip, and the text on it. */
  solid: string;
  onSolid: string;
}

/** Dark scheme: the hue's 300 shade as text on its 400 (as `r, g, b`) at low alpha; light: 800 on 100 (Tailwind's palette). */
const hue = (name: string, s300: string, s700: string, s800: string, s100: string, rgb400: string): TagHue => ({
  name,
  dark: { fg: s300, bg: `rgba(${rgb400}, 0.16)`, border: `rgba(${rgb400}, 0.5)`, solid: s300, onSolid: '#111827' },
  light: { fg: s800, bg: s100, border: s300, solid: s700, onSolid: '#ffffff' },
});

/**
 * Tag colors: ten distinct hues, each readable (WCAG AA) on the dashboard's dark and light backgrounds. A tag's hue
 * comes from its name, so it is the same everywhere (list, filters, job page) and on every visit.
 */
export const TAG_PALETTE: readonly TagHue[] = [
  hue('red', '#fca5a5', '#b91c1c', '#991b1b', '#fee2e2', '248, 113, 113'),
  hue('orange', '#fdba74', '#c2410c', '#9a3412', '#ffedd5', '251, 146, 60'),
  hue('amber', '#fcd34d', '#b45309', '#92400e', '#fef3c7', '251, 191, 36'),
  hue('lime', '#bef264', '#4d7c0f', '#3f6212', '#ecfccb', '163, 230, 53'),
  hue('emerald', '#6ee7b7', '#047857', '#065f46', '#d1fae5', '52, 211, 153'),
  hue('cyan', '#67e8f9', '#0e7490', '#155e75', '#cffafe', '34, 211, 238'),
  hue('sky', '#7dd3fc', '#0369a1', '#075985', '#e0f2fe', '56, 189, 248'),
  hue('indigo', '#a5b4fc', '#4338ca', '#3730a3', '#e0e7ff', '129, 140, 248'),
  hue('violet', '#c4b5fd', '#6d28d9', '#5b21b6', '#ede9fe', '167, 139, 250'),
  hue('pink', '#f9a8d4', '#be185d', '#9d174d', '#fce7f3', '244, 114, 182'),
];

/** The palette index of a tag: an FNV-1a hash of its name, ignoring case (tag filters ignore case too). */
export function tagColorIndex(tag: string): number {
  let hash = 0x811c9dc5;
  for (const char of tag.trim().toLowerCase()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % TAG_PALETTE.length;
}

const varName = (index: number, part: keyof TagShades) => `--qcli-tag-${index}-${part.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;

/** CSS variables of the palette for one scheme, written next to the theme tokens (see buildThemeCss). */
export function tagColorDeclarations(scheme: 'dark' | 'light'): string {
  return TAG_PALETTE.flatMap((h, i) =>
    (Object.keys(h[scheme]) as (keyof TagShades)[]).map(part => `  ${varName(i, part)}: ${h[scheme][part]};`),
  ).join('\n');
}

/** Inline style of a tag chip: tinted, or filled with a ring when `selected` (a selected filter). */
export function tagStyle(tag: string, selected = false): CSSProperties {
  const i = tagColorIndex(tag);
  return selected
    ? {
      color: `var(${varName(i, 'onSolid')})`,
      backgroundColor: `var(${varName(i, 'solid')})`,
      borderColor: `var(${varName(i, 'solid')})`,
      boxShadow: `0 0 0 2px var(--qcli-background), 0 0 0 4px var(${varName(i, 'solid')})`,
    }
    : {
      color: `var(${varName(i, 'fg')})`,
      backgroundColor: `var(${varName(i, 'bg')})`,
      borderColor: `var(${varName(i, 'border')})`,
    };
}
