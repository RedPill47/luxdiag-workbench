import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Static SPA. Base is "./" so the same build also works on GitHub Pages
// (the static fallback when live retrieval is dropped).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
