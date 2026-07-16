import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f0eee9',
        card: '#fdfcf9',
        ink: '#22201d',
        inkSecondary: '#55524c',
        divider: '#cfcbc2',
      },
    },
  },
  plugins: [],
};

export default config;
