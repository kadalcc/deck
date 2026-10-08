import { deck } from "@kadal/deck/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { basename } from "node:path";
import { defineConfig } from "vite";

// The deck's slug is its folder name; the host serves the built deck at /<slug>/ and the same
// path is used in dev so links, the presenter window and the API behave identically.
const slug = basename(import.meta.dirname);

export default defineConfig({
  base: `/${slug}/`,
  plugins: [deck({ entry: "deck.mdx" }), react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT ?? 5300),
    proxy: {
      // The shared backend (apps/deck-worker) in dev; DECK_API points at another instance.
      "/api": {
        target: process.env.DECK_API ?? "http://localhost:8797",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
