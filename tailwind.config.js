/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#faf5f2',
          100: '#f3e6de',
          200: '#e6cbbb',
          300: '#d5a78f',
          400: '#c07f62',
          500: '#ad6b4d',
          600: '#9a5b3f',
          700: '#7c4832',
          800: '#653c2c',
          900: '#533327',
        },
        ink: {
          900: '#161412',
          800: '#1f1c19',
          700: '#2a2622',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(28, 25, 23, 0.04), 0 1px 1px rgba(28, 25, 23, 0.02)',
        pop: '0 12px 32px -8px rgba(28, 25, 23, 0.18), 0 2px 6px rgba(28, 25, 23, 0.06)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(24px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-in': 'slide-in 200ms ease-out',
      },
    },
  },
  plugins: [],
};
