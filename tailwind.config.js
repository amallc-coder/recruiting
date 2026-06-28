/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm "paper" canvas + charcoal ink — the Clinilytics look.
        paper: '#f4f1ea',
        surface: '#fcfbf8',
        ink: '#1f1d1a',
        muted: '#6b6660',
        line: '#e7e2d7',
        // `brand` is intentionally a warm-charcoal scale so the many existing
        // `brand-*` utilities read as ink/emphasis rather than generic blue.
        brand: {
          50: '#f1efe9',
          100: '#e4e0d5',
          200: '#ccc5b5',
          300: '#a9a18d',
          400: '#736b5e',
          500: '#4c463d',
          600: '#2a2620',
          700: '#1d1a15',
          800: '#16130f',
          900: '#0f0d0a',
        },
        // Data + status accents.
        sage: { 50: '#e9efe5', 100: '#d3e0cd', 500: '#6e9a6a', 600: '#577f54', 700: '#456343' },
        // 700 shades added for WCAG-AA text on the matching 50 tints.
        clay: { 50: '#f5e7d9', 100: '#ecd1bc', 500: '#cd7c4f', 600: '#b4663b', 700: '#8a4e2d' },
        rust: { 50: '#f4ddd9', 100: '#ebc3bd', 500: '#be4b43', 600: '#9f3a33', 700: '#7f2d27' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(31,29,26,0.04), 0 1px 1px rgba(31,29,26,0.03)',
      },
    },
  },
  plugins: [],
}
