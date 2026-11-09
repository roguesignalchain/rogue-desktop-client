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
        void: '#000000',
        obsidian: {
          950: '#000000',
          900: '#050505',
          850: '#0a0a0c',
          800: '#0f0f13',
          700: '#141419',
          600: '#1c1c24',
        },
        surface: {
          DEFAULT: '#0a0a0c',
          card: '#0d0d11',
          elevated: '#121217',
          overlay: '#181820',
          hover: '#1e1e28',
        },
        rogue: {
          darkest: "#000000",
          card: "#0a0a0c",
          border: "rgba(255, 255, 255, 0.12)",
          accent: "#ffffff",
          accentGlow: "rgba(255, 255, 255, 0.3)",
          cyan: "#ffffff",
          green: "#ffffff",
        }
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        tactical: '2px',
      }
    },
  },
  plugins: [],
}
