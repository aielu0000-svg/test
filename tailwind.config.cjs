/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#FF8400',
          foreground: '#111111',
        },
        background: {
          light: '#F2F3F0',
          dark: '#111111',
        },
        foreground: {
          light: '#111111',
          dark: '#FFFFFF',
        },
        card: {
          light: '#FFFFFF',
          dark: '#1A1A1A',
          'foreground-light': '#111111',
          'foreground-dark': '#FFFFFF',
        },
        muted: {
          light: '#F2F3F0',
          dark: '#2E2E2E',
          'foreground-light': '#666666',
          'foreground-dark': '#B8B9B6',
        },
        sidebar: {
          light: '#E7E8E5',
          dark: '#18181b',
          'accent-light': '#CBCCC9',
          'accent-dark': '#2a2a30',
          'foreground-light': '#666666',
          'foreground-dark': '#fafafa',
          'border-light': '#CBCCC9',
          'border-dark': '#ffffff1a',
          'accent-foreground-light': '#18181b',
          'accent-foreground-dark': '#fafafa',
        },
        border: {
          light: '#CBCCC9',
          dark: '#2E2E2E',
        },
        input: {
          light: '#CBCCC9',
          dark: '#2E2E2E',
        },
        success: {
          light: '#DFE6E1',
          dark: '#222924',
          'foreground-light': '#004D1A',
          'foreground-dark': '#B6FFCE',
        },
        warning: {
          light: '#E9E3D8',
          dark: '#291C0F',
          'foreground-light': '#804200',
          'foreground-dark': '#FF8400',
        },
        error: {
          light: '#E5DCDA',
          dark: '#24100B',
          'foreground-light': '#8C1C00',
          'foreground-dark': '#FF5C33',
        },
        info: {
          light: '#DFDFE6',
          dark: '#222229',
          'foreground-light': '#000066',
          'foreground-dark': '#B2B2FF',
        },
        destructive: {
          light: '#D93C15',
          dark: '#FF5C33',
          'foreground-light': '#FFFFFF',
          'foreground-dark': '#FFFFFF',
        },
        secondary: {
          light: '#E7E8E5',
          dark: '#2E2E2E',
          'foreground-light': '#111111',
          'foreground-dark': '#FFFFFF',
        },
        accent: {
          light: '#CBCCC9',
          dark: '#27272A',
          'foreground-light': '#111111',
          'foreground-dark': '#FAFAFA',
        },
      },
      fontFamily: {
        primary: ['JetBrains Mono', 'monospace'],
        secondary: ['Geist', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        pill: '999px',
      },
    }
  },
  plugins: []
};
