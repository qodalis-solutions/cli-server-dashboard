import kit from './dist/tailwind-preset.js';

/** dist/styles.css: the classes the kit's components use, without Tailwind's base (the page has its own). */
export default {
  presets: [kit],
  content: ['./src/**/*.{ts,tsx}', '!./src/**/*.test.{ts,tsx}'],
  corePlugins: { preflight: false },
};
