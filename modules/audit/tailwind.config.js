import kit from '../../kit/src/theme/tailwind-preset.ts';

/** The kit's preset (the dashboard's theme tokens as colors); no preflight: the dashboard has its own base styles. */
export default {
  presets: [kit],
  content: ['./src/**/*.{ts,tsx}', '../../kit/src/components/**/*.tsx'],
  corePlugins: { preflight: false },
  // Utilities apply only inside the elements the dashboard mounts the module into (EXTENSION_SCOPE), so they never
  // override the dashboard's own classes on its other pages
  important: '.qcli-extension',
};
