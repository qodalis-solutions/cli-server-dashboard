import { THEME_TOKENS, cssVarName } from './tokens';

/**
 * Tailwind preset of the dashboard and its extensions: every color is a theme token
 * (`tokens.ts`), read from its CSS custom property, so a page built with it follows the
 * dashboard's theme (light, dark, the host's colors) with no code. color-mix keeps opacity
 * modifiers working for any CSS color format: `bg-error/10` is the error color at 10%.
 *
 * ```js
 * // tailwind.config.js of an extension
 * import kit from '@qodalis/cli-server-dashboard-kit/tailwind-preset';
 * export default { presets: [kit], content: ['./src/**\/*.{ts,tsx}'] };
 * ```
 */
const kebab = (token: string) => token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const colors = Object.fromEntries(
  THEME_TOKENS.map((token) => [
    kebab(token),
    `color-mix(in srgb, var(${cssVarName(token)}) calc(<alpha-value> * 100%), transparent)`,
  ]),
);

const preset = {
  theme: {
    // Replace (not extend) the palette so stock colors such as slate-400 cannot bypass the tokens.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      ...colors,
    },
    extend: {
      // Entrances of popovers and dialogs (used with motion-safe:, so reduced motion shows them at once)
      keyframes: {
        'pop-in': { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'sheet-in': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'pop-in': 'pop-in 120ms ease-out',
        'fade-in': 'fade-in 150ms ease-out',
        'sheet-in': 'sheet-in 200ms ease-out',
      },
    },
  },
  plugins: [],
};

export default preset;
