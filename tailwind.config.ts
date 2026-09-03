import type { Config } from "tailwindcss";

// Theme direction: teal = primary/trust, amber = grain/consignment,
// coral = money-owed-to-farmer state. See the dashboard mockup for
// how these get used — status pills borrow directly from this scale.
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#E1F5EE",
          500: "#1D9E75",
          600: "#0F6E56",
          900: "#04342C",
        },
        grain: {
          50: "#FAEEDA",
          500: "#EF9F27",
          600: "#854F0B",
          900: "#412402",
        },
        consigned: {
          50: "#FAECE7",
          500: "#D85A30",
          600: "#993C1D",
          900: "#4A1B0C",
        },
      },
      borderRadius: {
        DEFAULT: "8px",
        card: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
