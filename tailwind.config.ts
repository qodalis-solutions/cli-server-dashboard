import type { Config } from 'tailwindcss';
import { THEME_TOKENS, cssVarName } from './src/theme/tokens';

/**
 * Every color is a theme token (src/theme/tokens.ts), read from its CSS custom
 * property. color-mix keeps opacity modifiers working for any CSS color format:
 * `bg-error/10` is the error color at 10% of its own alpha.
 */
const kebab = (token: string) => token.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const colors = Object.fromEntries(
  THEME_TOKENS.map(token => [
    kebab(token),
    `color-mix(in srgb, var(${cssVarName(token)}) calc(<alpha-value> * 100%), transparent)`,
  ]),
);

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    // Replace (not extend) the palette so stock colors such as slate-400 cannot
    // bypass the tokens.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      ...colors,
    },
  },
  plugins: [],
} satisfies Config;
