/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Pride Hotels & Resorts maroon (sampled from the logo: #71302d)
        brand: {
          50: '#fdf5f4',
          100: '#fbe8e6',
          200: '#f6d3d0',
          300: '#edb0ab',
          400: '#e08078',
          500: '#cd564c',
          600: '#b13c33',
          700: '#932f28',
          800: '#7b2b26',
          900: '#71302d',
          950: '#3d1614',
        },
        // Pride Hotels & Resorts gold (sampled from the logo: #be863c)
        gold: {
          50: '#fbf7ef',
          100: '#f5ebd5',
          200: '#ead5a8',
          300: '#ddb972',
          400: '#d29f4c',
          500: '#be863c',
          600: '#a36c31',
          700: '#83522b',
          800: '#6d4429',
          900: '#5c3a26',
          950: '#341d12',
        },
      },
      fontFamily: {
        sans: [
          'Inter var',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px -12px rgba(16, 24, 40, 0.18)',
        'card-hover': '0 2px 4px rgba(16, 24, 40, 0.06), 0 16px 32px -16px rgba(16, 24, 40, 0.24)',
        brand: '0 8px 20px -8px rgba(113, 48, 45, 0.55)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #5c2422 0%, #71302d 45%, #8a3a2c 75%, #a36c31 100%)',
        'gold-gradient': 'linear-gradient(90deg, #be863c 0%, #ddb972 50%, #be863c 100%)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.45)' },
          '70%': { boxShadow: '0 0 0 10px rgba(16, 185, 129, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out both',
        'fade-in-up': 'fade-in-up 300ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 160ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'slide-in-right': 'slide-in-right 260ms cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
      },
    },
  },
  plugins: [],
}
