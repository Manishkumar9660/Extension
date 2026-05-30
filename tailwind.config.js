/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./popup.html",
    "./dashboard.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#030712', // Very dark slate
          card: '#0b0f19', // Slightly lighter container bg
          border: '#1f2937', // Dark gray border
          primary: '#3b82f6', // Cyber blue
          secondary: '#a855f7', // Cyber purple
          accent: '#10b981', // Emerald green
          success: '#10b981',
          warning: '#f59e0b',
          danger: '#ef4444',
          text: '#f3f4f6', // Bright text
          muted: '#9ca3af' // Muted text
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
        mono: ['Fira Code', 'Courier New', 'monospace']
      },
      boxShadow: {
        'glow-primary': '0 0 15px rgba(59, 130, 246, 0.3)',
        'glow-secondary': '0 0 15px rgba(168, 85, 247, 0.3)',
        'glow-accent': '0 0 15px rgba(16, 185, 129, 0.3)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite alternate',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%': { boxShadow: '0 0 5px rgba(59, 130, 246, 0.2), 0 0 10px rgba(168, 85, 247, 0.2)' },
          '100%': { boxShadow: '0 0 15px rgba(59, 130, 246, 0.5), 0 0 25px rgba(168, 85, 247, 0.5)' }
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' }
        }
      }
    },
  },
  plugins: [],
}
