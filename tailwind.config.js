/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#EBF5FF",
          100: "#D7EAFF",
          200: "#B0D5FF",
          300: "#88C0FF",
          400: "#61ABFF",
          500: "#3A96FF",
          600: "#0370E6",
          700: "#0257B3",
          800: "#023D80",
          900: "#01244D",
          950: "#00162E"
        }
      },
      boxShadow: {
        glow: "0 10px 50px -15px rgba(58, 150, 255, 0.6)"
      },
      animation: {
        pulseSlow: "pulse 4s ease-in-out infinite"
      }
    }
  },
  plugins: [require("@tailwindcss/forms")]
};
