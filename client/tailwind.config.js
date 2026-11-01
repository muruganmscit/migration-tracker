/** @type {import('tailwindcss').Config} */
const slate = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((shade) => [shade, `rgb(var(--slate-${shade}) / <alpha-value>)`])
);

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Defined in index.css; the slate scale is darkened so text stays readable.
      colors: {
        slate,
        surface: "rgb(var(--surface) / <alpha-value>)",
        edge: "var(--edge)",
      },
    },
  },
  plugins: [],
};
