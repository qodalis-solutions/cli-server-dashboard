import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#6366f1', light: '#818cf8', dark: '#4f46e5' },
        surface: {
          DEFAULT: 'rgba(255,255,255,0.04)',
          hover: 'rgba(255,255,255,0.08)',
          border: 'rgba(255,255,255,0.08)',
        },
        status: {
          success: '#4ade80',
          warning: '#fbbf24',
          error: '#f87171',
          info: '#22d3ee',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
