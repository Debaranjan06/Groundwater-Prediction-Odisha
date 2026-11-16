/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        forest: { 950: "#04201a", 900: "#062a20", 800: "#0b3d2e", 700: "#115740", 600: "#17724f" },
        aqua: { 50: "#effaff", 100: "#d9f3fd", 200: "#b6e8fb", 300: "#7fd6f7", 400: "#3fbcee", 500: "#16a0d8", 600: "#0e7fb0" },
        mist: "#f4f8f5",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(6,42,32,.05), 0 8px 24px -12px rgba(6,42,32,.15)" },
      keyframes: {
        rain: { "0%": { transform: "translateY(-20px)", opacity: 0 }, "20%": { opacity: 1 }, "100%": { transform: "translateY(120px)", opacity: 0 } },
        rise: { from: { opacity: 0, transform: "translateY(14px)" }, to: { opacity: 1, transform: "none" } },
        pulseRing: { "0%": { r: 6, opacity: 0.8 }, "100%": { r: 22, opacity: 0 } },
      },
      animation: { rain: "rain 1.8s linear infinite", rise: "rise .6s ease-out both", ring: "pulseRing 2.4s ease-out infinite" },
    },
  },
  plugins: [],
};
