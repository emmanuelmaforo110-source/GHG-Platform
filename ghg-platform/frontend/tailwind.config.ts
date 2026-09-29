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
        // Go Green brand palette ("Earth & Savanna") — see the Go Green brand sheet.
        brand: {
          DEFAULT: '#2E5E3A', // Forest: main brand colour, buttons, headings
          light: '#EDF1E2', // soft leaf tint for selected states
          leaf: '#9BB043', // Leaf: shapes, highlights, charts (not small text)
          'leaf-text': '#7E9435', // Leaf Text: readable leaf green on white
          savanna: '#D98E32', // Savanna: accent, use sparingly
          sand: '#F4EFE3', // Sand: soft backgrounds
          earth: '#3B2F25', // Earth: dark text on sand
        },
      },
      fontFamily: {
        // Loaded with next/font in app/layout.tsx
        sans: ['var(--font-body)', 'Inter', 'Segoe UI', 'Arial', 'sans-serif'],
        display: ['var(--font-display)', 'Montserrat', 'Segoe UI', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
