import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../dist/web", emptyOutDir: true },
  server: {
    port: 5173,
    // The API also serves the server-rendered knowledge base and crawl files.
    proxy: {
      "/api": "http://localhost:3000",
      "/learn": "http://localhost:3000",
      "/sitemap.xml": "http://localhost:3000",
      "/robots.txt": "http://localhost:3000",
    },
  },
});
