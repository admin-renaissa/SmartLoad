import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0F2044',
          foreground: '#FFFFFF',
          50: '#E8EDF5',
          100: '#C5D1E7',
          200: '#9AAED2',
          300: '#6F8BBD',
          400: '#4F71AE',
          500: '#2F579F',
          600: '#274F97',
          700: '#1E468D',
          800: '#153C83',
          900: '#0F2044',
        },
        accent: {
          DEFAULT: '#2563EB',
          foreground: '#FFFFFF',
        },
        success: {
          DEFAULT: '#15803D',
          foreground: '#FFFFFF',
          light: '#DCFCE7',
        },
        warning: {
          DEFAULT: '#B45309',
          foreground: '#FFFFFF',
          light: '#FEF3C7',
        },
        error: {
          DEFAULT: '#B91C1C',
          foreground: '#FFFFFF',
          light: '#FEE2E2',
        },
        background: 'var(--bg-primary)',
        surface: 'var(--bg-secondary)',
        card: 'var(--card-bg)',
        border: 'var(--border-color)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '0.75rem',
        button: '0.5rem',
        input: '0.375rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        modal: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [],
};

export default config;
