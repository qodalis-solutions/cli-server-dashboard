import type { Config } from 'tailwindcss';
import { THEME_TOKENS, cssVarName } from '../src/theme/tokens';

/**
 * The dashboard's palette (see ../tailwind.config.ts): every color is a theme token read from its CSS custom property,
 * so the portal follows the same theme.json colors (portal.json `theme`) as the dashboard.
 */
const kebab = (token: string) => token.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const colors = Object.fromEntries(
  THEME_TOKENS.map(token => [
    kebab(token),
    `color-mix(in srgb, var(${cssVarName(token)}) calc(<alpha-value> * 100%), transparent)`,
  ]),
);

export default {
  content: [
    `${__dirname}/index.html`,
    `${__dirname}/src/**/*.{js,ts,jsx,tsx}`,
    `${__dirname}/../src/components/**/*.{js,ts,jsx,tsx}`,
  ],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      ...colors,
    },
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
      keyframes: {
        'pop-in': { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: {
        'pop-in': 'pop-in 120ms ease-out',
        'fade-in': 'fade-in 150ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
