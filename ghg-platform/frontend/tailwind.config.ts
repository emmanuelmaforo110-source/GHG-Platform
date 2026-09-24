import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Loosely follows the Cove categorical palette used in the dashboard mockups,
        // so the running app visually matches what was shown during design review.
        scope1: '#2a78d6',
        scope2: '#eb6834',
        scope3: '#1baf7a',
        brand: {
          DEFAULT: '#1F5C3F',
          light: '#EAF2EC',
        },
      },
    },
  },
  plugins: [],
};
export default config;
