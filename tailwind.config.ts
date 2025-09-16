import type { Config } from 'tailwindcss'
export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0B0B0F',
        foreground: '#EDEDED',
        accent: '#F2C335', // amarillo huevo
      }
    },
  },
  plugins: [],
} satisfies Config