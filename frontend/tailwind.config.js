/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Tailwind grays → Appearance Studio semantic tokens (Theme colors + index.css).
         * Existing class names (bg-gray-50, dark:bg-gray-800, etc.) stay theme-aware.
         */
        gray: {
          50: 'var(--color-bg)',
          100: 'var(--color-border)',
          200: 'var(--color-border)',
          300: 'var(--color-text-muted)',
          400: 'var(--color-text-muted)',
          500: 'var(--color-text-muted)',
          600: 'var(--color-text)',
          700: 'var(--color-border)',
          800: 'var(--color-surface)',
          900: 'var(--color-text)',
          950: 'var(--color-bg)',
        },
        green: {
          100: 'var(--color-success-bg)',
          400: 'var(--color-success-text)',
          500: 'var(--color-success)',
          600: 'var(--color-success-text)',
          700: 'var(--color-success-text)',
          900: 'var(--color-success-bg)',
        },
        red: {
          100: 'var(--color-error-bg)',
          400: 'var(--color-error-text)',
          500: 'var(--color-error)',
          600: 'var(--color-error-text)',
          700: 'var(--color-error-text)',
          900: 'var(--color-error-bg)',
        },
        blue: {
          50: 'var(--color-info-bg)',
          100: 'var(--color-info-bg)',
          200: 'var(--color-info-bg)',
          400: 'var(--color-info-text)',
          500: 'var(--color-info-text)',
          600: 'var(--color-info-text)',
          800: 'var(--color-info-bg)',
          900: 'var(--color-info-bg)',
        },
        yellow: {
          100: 'var(--color-warning-bg)',
          400: 'var(--color-warning-text)',
          500: 'var(--color-warning)',
          600: 'var(--color-warning-text)',
          700: 'var(--color-warning-text)',
          900: 'var(--color-warning-bg)',
        },
        amber: {
          100: 'var(--color-warning-bg)',
          400: 'var(--color-warning-text)',
          500: 'var(--color-warning)',
          600: 'var(--color-warning-text)',
          700: 'var(--color-warning-text)',
          900: 'var(--color-warning-bg)',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-up': 'slideUp 0.6s ease-out',
        'scale-in': 'scaleIn 0.4s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
      },
    },
  },
  plugins: [],
};
