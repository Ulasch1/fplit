import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f0eee9',
        card: '#fdfcf9',
        ink: '#22201d',
        inkSecondary: '#55524c',
        divider: '#cfcbc2',
        inkMuted: '#8a8680',
        accent: 'oklch(45% 0.09 165)',
        debtor: 'oklch(52% 0.16 25)',
        creditor: 'oklch(46% 0.12 150)',
      },
      fontFamily: {
        kalam: ['var(--font-kalam)', 'cursive'],
        mono:  ['var(--font-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
