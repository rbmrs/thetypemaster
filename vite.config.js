import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from GitHub Pages at https://rbmrs.dev/thetypemaster/
export default defineConfig({
  base: "/thetypemaster/",
  plugins: [react()],
});
