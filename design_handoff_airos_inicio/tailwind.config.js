/** tailwind.config.js · AIROS Design System v1
 *  Mesclar com o config existente do projeto (manter plugins/content já configurados).
 *  Depende de tokens.css (variáveis RGB). */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: v('canvas'),
        surface: v('surface'),
        subtle: v('subtle'),
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        ink: v('ink'),
        muted: v('muted'),
        faint: v('faint'),
        accent: { DEFAULT: v('accent'), fg: v('accent-fg') },
        brand: {
          50: '#f8f6f3', 100: '#efebe4', 200: '#e0d7ca', 300: '#c9baa4', 400: '#ad9a7e',
          500: '#8f7c61', 600: '#76654e', 700: '#5f513f', 800: '#4a3f32', 900: '#3a3128',
        },
        stone: {
          50: '#faf9f7', 100: '#f3f1ed', 200: '#e9e6e1', 300: '#d9d4cc', 400: '#b3aca2',
          500: '#8a8379', 600: '#6b655c', 700: '#4f4a44', 800: '#34312d', 900: '#1f1d1b', 950: '#121110',
        },
        danger:  { bg: v('danger-bg'),  line: v('danger-line'),  solid: v('danger-solid'),  fg: v('danger-fg') },
        warning: { bg: v('warning-bg'), line: v('warning-line'), solid: v('warning-solid'), fg: v('warning-fg') },
        info:    { bg: v('info-bg'),    line: v('info-line'),    solid: v('info-solid'),    fg: v('info-fg') },
        success: { bg: v('success-bg'), line: v('success-line'), solid: v('success-solid'), fg: v('success-fg') },
        avatar: {
          slate: { bg: '#dfe7ec', fg: '#3b5566' }, sage: { bg: '#dde8de', fg: '#3f5d45' },
          clay: { bg: '#efe2d6', fg: '#7a4a30' }, plum: { bg: '#e8e2ee', fg: '#5a4a6b' },
          stone: { bg: '#e9e6e1', fg: '#4f4a44' },
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Inter Tight"', 'Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        display: ['36px', { lineHeight: '40px', letterSpacing: '-0.025em', fontWeight: '600' }],
        hero: ['40px', { lineHeight: '44px', letterSpacing: '-0.03em', fontWeight: '500' }],
        h1: ['28px', { lineHeight: '34px', letterSpacing: '-0.02em', fontWeight: '600' }],
        h2: ['20px', { lineHeight: '28px', letterSpacing: '-0.015em', fontWeight: '600' }],
        section: ['18px', { lineHeight: '24px', letterSpacing: '-0.01em', fontWeight: '600' }],
        h3: ['16px', { lineHeight: '24px', letterSpacing: '-0.01em', fontWeight: '600' }],
        metric: ['32px', { lineHeight: '36px', letterSpacing: '-0.025em', fontWeight: '400' }],
        'body-lg': ['15px', { lineHeight: '24px' }],
        body: ['14px', { lineHeight: '20px' }],
        sm: ['13px', { lineHeight: '18px' }],
        xs: ['12px', { lineHeight: '16px' }],
        eyebrow: ['11px', { lineHeight: '16px', letterSpacing: '0.14em', fontWeight: '600' }],
      },
      borderRadius: {
        xs: '6px', sm: '8px', md: '10px', lg: '14px', xl: '18px', '2xl': '24px',
      },
      boxShadow: {
        xs: '0 1px 0 rgb(18 17 16 / 0.04)',
        sm: '0 1px 2px rgb(18 17 16 / 0.05)',
        surface: '0 1px 2px rgb(18 17 16 / 0.04), 0 0 0 1px rgb(18 17 16 / 0.04)',
        md: '0 6px 16px -4px rgb(18 17 16 / 0.10)',
        lg: '0 24px 48px -12px rgb(18 17 16 / 0.20)',
        drag: '0 14px 28px -8px rgb(18 17 16 / 0.22)',
        focus: '0 0 0 1px rgb(143 124 97), 0 0 0 4px rgb(143 124 97 / 0.28)',
      },
      height: { control: '36px', 'control-sm': '32px', 'control-touch': '44px' },
      width: { sidebar: '232px', drawer: '520px', modal: '560px' },
      keyframes: { pulse2: { '50%': { opacity: '0.3' } } },
      animation: { 'timer-dot': 'pulse2 1.6s ease-in-out infinite' },
    },
  },
};
