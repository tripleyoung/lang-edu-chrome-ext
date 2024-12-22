/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./panel.html",
    "./popup.html"
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          900: 'rgb(17, 24, 39)',
          800: 'rgb(31, 41, 55)',
          700: 'rgb(55, 65, 81)',
          600: 'rgb(75, 85, 99)',
          500: 'rgb(107, 114, 128)',
          400: 'rgb(156, 163, 175)',
        }
      }
    },
  },
  plugins: []
};