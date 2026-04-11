import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  /** 与 macOS / 系统设置一致：`dark:` 随 `prefers-color-scheme` 切换 */
  darkMode: ['media'],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/streamdown/dist/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        /** 与 Vercel / Next.js 官方模板一致（Geist） */
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',
        primary: 'var(--primary)',
        'primary-foreground': 'var(--primary-foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        border: 'var(--border)',
        sidebar: 'var(--sidebar)',
        'sidebar-foreground': 'var(--sidebar-foreground)',
        popover: 'var(--popover)',
        'popover-foreground': 'var(--popover-foreground)',
        accent: 'var(--accent)',
        'accent-foreground': 'var(--accent-foreground)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
