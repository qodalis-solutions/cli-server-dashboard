import type { Config } from 'tailwindcss';
import kit from './kit/src/theme/tailwind-preset';

/** The kit's preset (theme tokens as colors, animations); the kit's components are scanned too. */
export default {
  presets: [kit],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', './kit/src/**/*.{ts,tsx}'],
} satisfies Config;
