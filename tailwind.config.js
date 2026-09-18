/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ivory: {
          DEFAULT: '#F8F4EC',
          soft: '#EDE4D5',
          pearl: '#FFFDF8',
        },
        espresso: {
          DEFAULT: '#211A17',
          charcoal: '#292522',
          light: '#3D3430',
        },
        gold: {
          DEFAULT: '#B08D57',
          champagne: '#D6B878',
          light: '#E6D3A7',
          dark: '#8C6C38',
        },
        burgundy: {
          DEFAULT: '#7A3035',
          muted: '#8F3D43',
        },
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(33, 26, 23, 0.05)',
        'elevated': '0 10px 30px -5px rgba(33, 26, 23, 0.1)',
        'gold-glow': '0 0 15px rgba(214, 184, 120, 0.25)',
      },
      borderRadius: {
        'brand': '6px',
      },
      animation: {
        'shimmer': 'shimmer 2.5s infinite linear',
        'pulse-subtle': 'pulseSubtle 3s ease-in-out infinite',
        'float': 'float 4s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
}
