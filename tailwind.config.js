/** AIROS · Tailwind
 *  Tema do design system (design_handoff_airos_inicio/tailwind.config.js) mesclado com o
 *  config do projeto. Cores vêm de src/styles/tokens.css e src/styles/theme.css
 *  (variáveis RGB), o que permite o modo escuro pela classe `.dark` no <html>.
 *  @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (name, steps) => Object.fromEntries(steps.map((s) => [s, v(`${name}-${s}`)]));

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: v('canvas'),
        surface: v('surface'),
        subtle: v('subtle'),
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        hairline: { DEFAULT: v('hairline'), surface: v('hairline-surface') },
        ink: v('ink'),
        muted: v('muted'),
        faint: v('faint'),
        overlay: v('overlay'),
        accent: { DEFAULT: v('accent'), fg: v('accent-fg') },
        brand: scale('brand', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        stone: scale('stone', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        danger: { bg: v('danger-bg'), line: v('danger-line'), solid: v('danger-solid'), fg: v('danger-fg') },
        warning: { bg: v('warning-bg'), line: v('warning-line'), solid: v('warning-solid'), fg: v('warning-fg') },
        info: { bg: v('info-bg'), line: v('info-line'), solid: v('info-solid'), fg: v('info-fg') },
        success: { bg: v('success-bg'), line: v('success-line'), solid: v('success-solid'), fg: v('success-fg') },
        avatar: {
          slate: { bg: '#dfe7ec', fg: '#3b5566' },
          sage: { bg: '#dde8de', fg: '#3f5d45' },
          clay: { bg: '#efe2d6', fg: '#7a4a30' },
          plum: { bg: '#e8e2ee', fg: '#5a4a6b' },
          stone: { bg: '#e9e6e1', fg: '#4f4a44' },
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Inter Tight Variable"', '"Inter Tight"', '"Inter Variable"', 'Inter', 'sans-serif'],
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
        xs: '6px',
        sm: '8px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '24px',
      },
      boxShadow: {
        xs: '0 1px 0 rgb(18 17 16 / 0.04)',
        /* Cartões e painéis: sombra quase imperceptível, só para destacar do fundo */
        card: '0 1px 2px rgb(18 17 16 / 0.035), 0 8px 24px -12px rgb(18 17 16 / 0.08)',
        sm: '0 1px 2px rgb(18 17 16 / 0.05)',
        surface: '0 1px 2px rgb(18 17 16 / 0.04), 0 0 0 1px rgb(18 17 16 / 0.04)',
        md: '0 6px 16px -4px rgb(18 17 16 / 0.10)',
        lg: '0 24px 48px -12px rgb(18 17 16 / 0.20)',
        drag: '0 14px 28px -8px rgb(18 17 16 / 0.22)',
        focus: '0 0 0 1px rgb(143 124 97), 0 0 0 4px rgb(143 124 97 / 0.28)',
      },
      height: { control: '36px', 'control-sm': '32px', 'control-touch': '44px' },
      width: { sidebar: '232px', drawer: '520px', modal: '560px' },
      maxWidth: { drawer: '520px', modal: '560px' },
      keyframes: {
        pulse2: { '50%': { opacity: '0.3' } },
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(24px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        'slide-up': { from: { transform: 'translateY(24px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        shimmer: { '50%': { opacity: '0.55' } },
      },
      animation: {
        'timer-dot': 'pulse2 1.6s ease-in-out infinite',
        'fade-in': 'fade-in 180ms ease-out',
        'slide-in': 'slide-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'slide-up': 'slide-up 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
