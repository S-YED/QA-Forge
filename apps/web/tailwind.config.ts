import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

/** Token → utility mapping. Tokens hold OKLCH "L C H" triplets in globals.css;
 *  wrapping in oklch(var(--t) / <alpha-value>) keeps opacity utilities working
 *  (e.g. bg-primary/10, border-border/60). */
const c = (token: string) => `oklch(var(${token}) / <alpha-value>)`;

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1240px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        border: c('--border'),
        input: c('--input'),
        ring: c('--ring'),
        background: c('--background'),
        foreground: c('--foreground'),
        primary: { DEFAULT: c('--primary'), foreground: c('--primary-foreground') },
        secondary: { DEFAULT: c('--secondary'), foreground: c('--secondary-foreground') },
        destructive: { DEFAULT: c('--destructive'), foreground: c('--destructive-foreground') },
        success: { DEFAULT: c('--success'), foreground: c('--success-foreground') },
        warning: { DEFAULT: c('--warning'), foreground: c('--warning-foreground') },
        info: { DEFAULT: c('--info'), foreground: c('--info-foreground') },
        muted: { DEFAULT: c('--muted'), foreground: c('--muted-foreground') },
        accent: { DEFAULT: c('--accent'), foreground: c('--accent-foreground') },
        popover: { DEFAULT: c('--popover'), foreground: c('--popover-foreground') },
        card: { DEFAULT: c('--card'), foreground: c('--card-foreground') },
        sidebar: {
          DEFAULT: c('--sidebar'),
          foreground: c('--sidebar-foreground'),
          border: c('--sidebar-border'),
          accent: c('--sidebar-accent'),
          'accent-foreground': c('--sidebar-accent-foreground'),
        },
        console: {
          DEFAULT: c('--console'),
          foreground: c('--console-foreground'),
          muted: c('--console-muted'),
          border: c('--console-border'),
          success: c('--console-success'),
          error: c('--console-error'),
          info: c('--console-info'),
          accent: c('--console-accent'),
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontSize: {
        // Tightened tracking on display sizes; floor stays ≥ -0.04em
        '5xl': ['3rem', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        '6xl': ['3.75rem', { lineHeight: '1.03', letterSpacing: '-0.035em' }],
        '7xl': ['4.5rem', { lineHeight: '1.0', letterSpacing: '-0.04em' }],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 oklch(var(--info) / 0.45)' },
          '70%': { boxShadow: '0 0 0 6px oklch(var(--info) / 0)' },
          '100%': { boxShadow: '0 0 0 0 oklch(var(--info) / 0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
