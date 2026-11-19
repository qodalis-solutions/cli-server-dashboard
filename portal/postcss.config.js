import { fileURLToPath } from 'node:url';

export default {
  plugins: {
    // The portal's own Tailwind config, whatever the working directory of the build
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.ts', import.meta.url)) },
    autoprefixer: {},
  },
};
