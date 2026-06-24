/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#bcd2ff',
          300: '#8eb5ff',
          400: '#598cff',
          500: '#3563ff',
          600: '#1f43f5',
          700: '#1731e1',
          800: '#1929b6',
          900: '#1b298f',
        },
      },
    },
  },
  plugins: [],
}
