/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'byla-navy': '#020617',
        'byla-navy-light': '#0f172a',
        'byla-navy-border': '#1e293b',
        'byla-red': '#e11d48',
        'byla-red-light': '#f43f5e',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
