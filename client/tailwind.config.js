/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#070709',
        card: '#0f0f13',
        popover: '#0f0f13',
        primary: {
          DEFAULT: '#8b5cf6', // purple
          hover: '#a78bfa',
          glow: 'rgba(139, 92, 246, 0.15)'
        },
        secondary: {
          DEFAULT: '#06b6d4', // cyan
          hover: '#22d3ee',
          glow: 'rgba(6, 182, 212, 0.15)'
        },
        accent: {
          DEFAULT: '#10b981', // emerald
          hover: '#34d399',
          glow: 'rgba(16, 185, 129, 0.15)'
        },
        border: '#1b1b22',
        muted: '#6b7280',
        text: {
          DEFAULT: '#f3f4f6',
          muted: '#9ca3af',
          dark: '#4b5563'
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
        mono: ['Fira Code', 'JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'premium': '0 8px 30px rgb(0 0 0 / 0.5)',
        'glow-purple': '0 0 20px rgba(139, 92, 246, 0.25)',
        'glow-cyan': '0 0 20px rgba(6, 182, 212, 0.25)',
      },
      backdropBlur: {
        'premium': '12px',
      }
    },
  },
  plugins: [],
}
