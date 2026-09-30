/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Acento discreto (bronze acinzentado) — usado com parcimônia
        brand: {
          50: '#f8f6f3',
          100: '#f0ece6',
          200: '#e2dace',
          300: '#cbbda9',
          400: '#ae9c82',
          500: '#8f7c61',
          600: '#76654e',
          700: '#5f513f',
          800: '#4a3f32',
          900: '#3a3128',
        },
        ink: {
          900: '#121110',
          800: '#1c1a18',
          700: '#2e2b28',
        },
        canvas: '#f6f5f2',
        line: '#e9e6e1',
      },
      boxShadow: {
        card: '0 1px 2px rgba(18, 17, 16, 0.03)',
        pop: '0 24px 48px -16px rgba(18, 17, 16, 0.18), 0 2px 8px rgba(18, 17, 16, 0.05)',
      },
      borderRadius: {
        '2xl': '1.125rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(24px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-in': 'slide-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
