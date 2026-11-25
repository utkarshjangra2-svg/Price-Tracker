/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        orange: {
          light: '#ff8a5c',
          DEFAULT: '#ff6b35',
          dark: '#e0531f',
        },
        charcoal: {
          light: '#2c2c35',
          DEFAULT: '#1c1c24',
          dark: '#0f0f14',
        },
        freshgreen: {
          light: '#4ade80',
          DEFAULT: '#22c55e',
          dark: '#16a34a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      animation: {
        'scroll-left': 'scroll-left 25s linear infinite',
        'scroll-right': 'scroll-right 25s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'scroll-left': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'scroll-right': {
          '0%': { transform: 'translateX(-50%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      }
    },
  },
  plugins: [],
}
