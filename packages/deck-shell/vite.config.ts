import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deck } from "@kadal/deck/vite";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

// Served from wherever the deck lives (/@you/talk/), so every URL is relative. The deck() plugin
// is here only for its Excalidraw fonts copy: the shell never imports virtual:deck.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  plugins: [deck({ entry: "__none__.mdx" })],
  define: { __KADAL_DECK_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 4000 },
  logLevel: "warn",
});
