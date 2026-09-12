import type { Config } from "tailwindcss";

/**
 * MARKET HUB brand tokens — see docs/handoff/UI_UX_DESIGN_SYSTEM.md.
 * Neutral surfaces dominate; navy carries structure, green carries action,
 * gold is used sparingly as an accent only.
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: "#0B1F33",
        green: {
          DEFAULT: "#0F8B6D",
          dark: "#08705A",
        },
        gold: "#C79A3B",
        background: "#F7F9FB",
        surface: "#FFFFFF",
        border: "#E4E9EF",
        text: {
          primary: "#17212B",
          secondary: "#667085",
        },
        muted: "#98A2B3",
        success: "#17865B",
        warning: "#B7791F",
        danger: "#C43D3D",
        info: "#2563A8",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        control: "8px",
        card: "12px",
        panel: "16px",
      },
      maxWidth: {
        content: "1440px",
      },
    },
  },
  plugins: [],
};
export default config;
