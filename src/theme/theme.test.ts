import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildThemeCss, isColor, loadTheme, resolveTheme } from './theme';
import { DARK_COLORS, DEFAULT_THEME, LIGHT_COLORS, THEME_TOKENS, cssVarName } from './tokens';

describe('isColor', () => {
  it.each([
    '#fff', '#ffff', '#4f46e5', '#4f46e5cc', 'rgb(1, 2, 3)', 'rgba(255,255,255,0.04)',
    'rgb(1 2 3 / 50%)', 'hsl(240deg 100% 50%)', 'oklch(0.7 0.1 250)', 'transparent', 'rebeccapurple',
  ])('accepts %s', value => {
    expect(isColor(value)).toBe(true);
  });

  it.each([
    '', '#ggg', '#12345', 'red;}body{display:none', 'url(https://x)', 'var(--x)',
    'rgb(1,2,3);color:red', 'expression(alert(1))', '"red"', 'rgb(calc(1),2,3)', 42, null, 'x'.repeat(101),
  ])('rejects %s', value => {
    expect(isColor(value)).toBe(false);
  });
});

describe('resolveTheme', () => {
  it('returns the defaults for an empty or malformed document', () => {
    expect(resolveTheme(undefined)).toEqual(DEFAULT_THEME);
    expect(resolveTheme('nope')).toEqual(DEFAULT_THEME);
    expect(resolveTheme({})).toEqual(DEFAULT_THEME);
  });

  it('merges overrides over each scheme', () => {
    const theme = resolveTheme({ mode: 'system', dark: { primary: '#4f9be0' }, light: { background: '#f1f6fa' } });
    expect(theme.mode).toBe('system');
    expect(theme.dark).toEqual({ ...DARK_COLORS, primary: '#4f9be0' });
    expect(theme.light).toEqual({ ...LIGHT_COLORS, background: '#f1f6fa' });
  });

  it('drops unknown tokens, invalid colors and an invalid mode', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const theme = resolveTheme({
      mode: 'neon',
      dark: { primary: 'red;}*{display:none', nope: '#fff', text: '#eee' },
      light: ['#fff'],
    });
    expect(theme.mode).toBe('dark');
    expect(theme.dark).toEqual({ ...DARK_COLORS, text: '#eee' });
    expect(theme.light).toEqual(LIGHT_COLORS);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});

describe('buildThemeCss', () => {
  it('defines every token for both schemes', () => {
    const css = buildThemeCss(DEFAULT_THEME);
    for (const token of THEME_TOKENS) {
      expect(css).toContain(`${cssVarName(token)}: ${DARK_COLORS[token]};`);
      expect(css).toContain(`${cssVarName(token)}: ${LIGHT_COLORS[token]};`);
    }
    expect(css).toContain(':root[data-qcli-theme="light"]');
    expect(cssVarName('primaryHover')).toBe('--qcli-primary-hover');
  });

  it('has a valid default for every token', () => {
    for (const token of THEME_TOKENS) {
      expect(isColor(DARK_COLORS[token])).toBe(true);
      expect(isColor(LIGHT_COLORS[token])).toBe(true);
    }
  });
});

describe('loadTheme', () => {
  it('reads the server theme', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ mode: 'light', light: { primary: '#2a6bba' } }))));
    const theme = await loadTheme('/qcli/admin/theme.json');
    expect(theme.mode).toBe('light');
    expect(theme.light.primary).toBe('#2a6bba');
    vi.unstubAllGlobals();
  });

  it('falls back to the defaults when the theme is missing or not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    expect(await loadTheme('/theme.json')).toEqual(DEFAULT_THEME);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>')));
    expect(await loadTheme('/theme.json')).toEqual(DEFAULT_THEME);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await loadTheme('/theme.json')).toEqual(DEFAULT_THEME);
    vi.unstubAllGlobals();
  });
});

describe('components', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap(name => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
    });
  const tokenNames = new Set(THEME_TOKENS.map(t => t.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)));
  const colorUtility = /(?:^|[\s"'`:])(?:bg|text|border|divide|ring|from|via|to|placeholder|fill|stroke|outline|shadow|decoration|accent|caret)-([a-z]+(?:-[a-z]+)*?)(?:-\d{2,3})?(?:\/[\w.[\]]+)?(?=[\s"'`}])/g;
  const nonColor = /^(?:xs|sm|base|lg|xl|\dxl|left|right|center|justify|start|end|ellipsis|clip|wrap|nowrap|balance|pretty|r|l|t|b|x|y|0|2|4|8|none|solid|dashed|dotted|double|collapse|separate|opacity|transparent|current|inherit|gradient-to-[a-z]+|clip-[a-z]+|fixed|local|scroll|auto|cover|contain|no-repeat|repeat|top|bottom|origin-[a-z]+|offset-\d+)$/;

  it('use only theme tokens for colors', () => {
    const offenders: string[] = [];
    for (const file of files(join(__dirname, '..'))) {
      if (file.includes(`${join('src', 'theme')}`) || file.includes(`${join('src', 'i18n')}`)) continue;
      const source = readFileSync(file, 'utf8');
      if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(source)) offenders.push(`${file}: literal color`);
      for (const match of source.matchAll(colorUtility)) {
        const name = match[1];
        if (!nonColor.test(name) && !tokenNames.has(name)) offenders.push(`${file}: ${match[0].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
