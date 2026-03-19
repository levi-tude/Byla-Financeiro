/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'byla-sand': '#E8DCC4',
        'byla-sand-light': '#F5F0E8',
        'byla-sand-dark': '#D4C4A8',
        'byla-ocean': '#2C5F7C',
        'byla-ocean-light': '#4A8BAD',
        'byla-ocean-dark': '#1A3D52',
        'byla-natural': '#A68B5B',
        'byla-warm': '#C9A96A',
      },
      fontFamily: {
        'display': ['Playfair Display', 'serif'],
        'sans': ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
