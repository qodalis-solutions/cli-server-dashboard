import kit from '../../kit/src/theme/tailwind-preset.ts';

/** The kit's preset (the dashboard's theme tokens as colors); no preflight: the dashboard has its own base styles. */
export default {
  presets: [kit],
  content: ['./src/**/*.{ts,tsx}', '../../kit/src/components/**/*.tsx'],
  corePlugins: { preflight: false },
};
