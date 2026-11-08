/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        rogue: {
          darkest: "#0a0b0e",
          card: "#12141a",
          border: "#1f242d",
          accent: "#ff3366",
          accentGlow: "#ff0055",
          cyan: "#00f0ff",
          green: "#00ff88",
        }
      }
    },
  },
  plugins: [],
}

