/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        // Distinctive editorial display + clean modern body + technical mono
        display: ['"Fraunces"', "ui-serif", "Georgia", "serif"],
        sans: ['"Geist"', "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // ---- Brand --------------------------------------------------------
        ocean: {
          DEFAULT: "#2F7DFF",
          50: "#EAF2FF",
          100: "#D4E5FF",
          200: "#A9C9FF",
          300: "#7FAEFF",
          400: "#5495FF",
          500: "#2F7DFF",
          600: "#1F62D9",
          700: "#1849A6",
          800: "#0F3373",
          900: "#0A2554",
        },
        furina: "#66B8FF",
        opera: "#8A6CFF",
        aqua: "#8EEBFF",
        // ---- Surfaces -----------------------------------------------------
        app: "rgb(var(--app) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-soft": "rgb(var(--surface-soft) / <alpha-value>)",
        "surface-deep": "rgb(var(--surface-deep) / <alpha-value>)",
        // ---- Text ---------------------------------------------------------
        ink: {
          primary: "rgb(var(--ink-primary) / <alpha-value>)",
          secondary: "rgb(var(--ink-secondary) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          inverse: "rgb(var(--ink-inverse) / <alpha-value>)",
        },
        // ---- Bubbles ------------------------------------------------------
        bubble: {
          user: "#2F7DFF",
          ai: "rgb(var(--bubble-ai) / <alpha-value>)",
          aiAlt: "rgb(var(--bubble-ai-alt) / <alpha-value>)",
          border: "rgb(var(--bubble-border) / <alpha-value>)",
        },
        // ---- Lines & glass -----------------------------------------------
        line: {
          light: "rgb(var(--line-light) / <alpha-value>)",
          focus: "#8EEBFF",
        },
        glass: "rgb(var(--glass) / <alpha-value>)",
        // ---- Status -------------------------------------------------------
        success: "#35C789",
        warning: "#FFB84D",
        danger: "#FF5C7A",
        info: "#4DA3FF",
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(47, 125, 255, 0.25)",
        glow: "0 0 0 1px rgba(142, 235, 255, 0.6), 0 8px 32px -8px rgba(47, 125, 255, 0.55)",
        bubble: "0 6px 22px -10px rgba(47, 125, 255, 0.4)",
        ring: "0 0 0 4px rgba(142, 235, 255, 0.35)",
        rail: "inset -1px 0 0 rgba(221, 234, 247, 0.6)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #66B8FF 0%, #2F7DFF 45%, #8A6CFF 100%)",
        "brand-soft": "linear-gradient(135deg, #EAF5FF 0%, #DFF4FF 100%)",
        "bubble-mine": "linear-gradient(180deg, #3D8CFF 0%, #2F7DFF 100%)",
        "aurora":
          "radial-gradient(60% 60% at 20% 10%, rgba(142,235,255,0.55) 0%, transparent 60%), radial-gradient(50% 50% at 85% 20%, rgba(138,108,255,0.45) 0%, transparent 60%), radial-gradient(60% 60% at 50% 100%, rgba(47,125,255,0.45) 0%, transparent 60%)",
        "aurora-dark":
          "radial-gradient(60% 60% at 20% 10%, rgba(142,235,255,0.18) 0%, transparent 60%), radial-gradient(50% 50% at 85% 20%, rgba(138,108,255,0.22) 0%, transparent 60%), radial-gradient(60% 60% at 50% 100%, rgba(47,125,255,0.22) 0%, transparent 60%)",
        "noise":
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: 0, transform: "translateY(8px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { transform: "scale(1)", opacity: 1 },
          "50%": { transform: "scale(1.15)", opacity: 0.85 },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "aurora-drift": {
          "0%, 100%": { transform: "translate3d(0,0,0) rotate(0deg)" },
          "50%": { transform: "translate3d(2%, -1%, 0) rotate(0.5deg)" },
        },
        "voicebar": {
          "0%, 100%": { height: "4px" },
          "50%": { height: "16px" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        "shimmer": "shimmer 2.4s linear infinite",
        "aurora-drift": "aurora-drift 18s ease-in-out infinite",
        "voicebar": "voicebar 0.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
