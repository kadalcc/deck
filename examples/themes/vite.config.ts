import { deck } from "@kadal/deck/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The theme gallery: deck.mdx lists every first-party theme in `themes:`, and the deck plugin
// brings each one's stylesheet in (the active theme's module eagerly, the others lazily).
export default defineConfig({
  base: "/",
  plugins: [deck({ entry: "deck.mdx" }), react()],
  server: { port: Number(process.env.PORT ?? 5173) },
  build: { outDir: "dist", emptyOutDir: true },
});
