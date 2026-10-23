import { deck } from "@kadal/deck/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Served from the site root. `kadal-deck publish` builds again with the base the host assigns
// (/@you/<slug>/), so nothing here needs to know where the deck will live.
//
// Set KADAL_DECK_API to a Kadal Deck host (your own, e.g. http://localhost:8797) to try the live
// room while developing: /api is proxied to it and the deck's room switches on.
// loadEnv(mode, false, "") reads the shell environment without `process`, so the scaffold
// typechecks without @types/node.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, false, "");
  const api = env.KADAL_DECK_API;
  return {
    base: "/",
    plugins: [deck({ entry: "deck.mdx" }), react(), tailwindcss()],
    define: api ? { "import.meta.env.VITE_KADAL_DECK_LIVE": JSON.stringify("1") } : {},
    server: {
      port: Number(env.PORT ?? 5173),
      proxy: api ? { "/api": { target: api, changeOrigin: true, ws: true } } : undefined,
    },
    build: { outDir: "dist", emptyOutDir: true },
  };
});
