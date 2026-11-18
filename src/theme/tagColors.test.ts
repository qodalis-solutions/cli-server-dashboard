import { describe, expect, it } from 'vitest';
import { TAG_PALETTE, tagColorDeclarations, tagColorIndex, tagStyle } from './tagColors';
import { DARK_COLORS, LIGHT_COLORS } from './tokens';

/** Hex or rgba() as [r, g, b, a]. */
function parse(color: string): [number, number, number, number] {
  const rgba = /rgba?\(([^)]+)\)/.exec(color);
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1].split(',').map(v => v.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  const hex = color.replace('#', '');
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).concat(1) as [number, number, number, number];
}

/** `top` painted over the opaque `under`. */
function over(top: string, under: [number, number, number]): [number, number, number] {
  const [r, g, b, a] = parse(top);
  return [r * a + under[0] * (1 - a), g * a + under[1] * (1 - a), b * a + under[2] * (1 - a)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const rgb = (color: string) => parse(color).slice(0, 3) as [number, number, number];
/** The page backgrounds a chip sits on in each scheme (the page, a sidebar or popover). */
const BACKGROUNDS = {
  dark: [DARK_COLORS.background, DARK_COLORS.backgroundAccent, DARK_COLORS.sidebar],
  light: [LIGHT_COLORS.background, LIGHT_COLORS.backgroundAccent, LIGHT_COLORS.surface],
};

describe('tagColorIndex', () => {
  it('gives a tag the same color every time, ignoring case and spaces around it', () => {
    expect(tagColorIndex('billing')).toBe(tagColorIndex('billing'));
    expect(tagColorIndex('Billing')).toBe(tagColorIndex('billing'));
    expect(tagColorIndex(' billing ')).toBe(tagColorIndex('billing'));
    for (const tag of ['a', 'demo', 'system', 'rates', '日本']) {
      const index = tagColorIndex(tag);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(TAG_PALETTE.length);
    }
  });

  it('spreads different tags across the palette', () => {
    const counts = new Array(TAG_PALETTE.length).fill(0);
    for (let i = 0; i < 200; i++) counts[tagColorIndex(`tag-${i}`)]++;
    expect(counts.every(n => n > 0)).toBe(true);
    expect(Math.max(...counts)).toBeLessThan(200 * 0.2);
    // Real tags: country codes and topics land on several hues, not one
    const demo = ['am', 'cz', 'demo', 'fetch', 'ge', 'health', 'il', 'kz', 'md', 'pl', 'ro', 'rs', 'system', 'tr', 'ua', 'uz'];
    expect(new Set(demo.map(tagColorIndex)).size).toBeGreaterThanOrEqual(7);
  });
});

describe('TAG_PALETTE', () => {
  it('has distinct hues', () => {
    expect(TAG_PALETTE.length).toBeGreaterThanOrEqual(8);
    expect(new Set(TAG_PALETTE.map(h => h.dark.fg)).size).toBe(TAG_PALETTE.length);
    expect(new Set(TAG_PALETTE.map(h => h.light.fg)).size).toBe(TAG_PALETTE.length);
  });

  it.each(['dark', 'light'] as const)('reads at WCAG AA (4.5:1) in the %s scheme, tinted and selected', scheme => {
    for (const h of TAG_PALETTE) {
      const shades = h[scheme];
      for (const page of BACKGROUNDS[scheme]) {
        const pageRgb = over(page, scheme === 'dark' ? [17, 24, 39] : [255, 255, 255]);
        const chip = over(shades.bg, pageRgb);
        expect(contrast(rgb(shades.fg), chip), `${h.name} tag on ${page}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(rgb(shades.onSolid), rgb(shades.solid)), `${h.name} selected`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('tagStyle / tagColorDeclarations', () => {
  it('styles a chip from the theme variables of its hue', () => {
    const i = tagColorIndex('demo');
    expect(tagStyle('demo')).toEqual({
      color: `var(--qcli-tag-${i}-fg)`,
      backgroundColor: `var(--qcli-tag-${i}-bg)`,
      borderColor: `var(--qcli-tag-${i}-border)`,
    });
    expect(tagStyle('demo', true)).toMatchObject({ color: `var(--qcli-tag-${i}-on-solid)`, backgroundColor: `var(--qcli-tag-${i}-solid)` });
  });

  it('declares every variable for each scheme', () => {
    const dark = tagColorDeclarations('dark');
    const light = tagColorDeclarations('light');
    TAG_PALETTE.forEach((h, i) => {
      expect(dark).toContain(`--qcli-tag-${i}-fg: ${h.dark.fg};`);
      expect(light).toContain(`--qcli-tag-${i}-on-solid: ${h.light.onSolid};`);
    });
  });
});
