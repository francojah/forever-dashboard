import type { Config } from 'tailwindcss'

const v = (name: string) => `rgb(var(--f-${name}) / <alpha-value>)`

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Faro v2 — tokens semánticos (ver app/globals.css)
        bg: v('bg'),
        surface: v('surface'),
        sunken: v('sunken'),
        ink: v('ink'),
        mute: v('mute'),
        faint: v('faint'),
        line: v('line'),
        beacon: v('beacon'),
        'beacon-ink': v('beacon-ink'),
        good: v('good'),
        bad: v('bad'),
        warn: v('warn'),
        brand: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          900: '#14532d',
        },
      },
      fontFamily: {
        faro: ['var(--font-faro)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        panel: '12px',
      },
    },
  },
  plugins: [],
}
export default config
